import { Room, Client, ServerError } from "colyseus";
import { WorldState, Player } from "./schema";
import { verifyToken, loadCharacter, loadStash, saveChar, saveStash, AuthUser } from "./auth";
import { MonsterSim, Sim } from "./monsters";
import { Dungeons } from "./dungeon";
const R: any = require("./rules.js");

const MAP = 80;          // mesmo limite do cliente
const RATE = 14;         // unidades/s sustentadas (jogador anda ~6-8)
const BURST = 20;        // folga para habilidades de avanço (ex.: Investida)
const clamp = (v: number) => Math.max(-MAP, Math.min(MAP, v));
// O mundo tem duas regiões de 160x160: a Vila Aurora (centro x=0) e Solara (centro x=300).
const cx = (x: number) => (x > 450 ? 600 : x > 150 ? 300 : 0);
const clampX = (x: number, ref: number) => { const c = cx(ref), w = c === 600 ? 12 : MAP; return Math.max(c - w, Math.min(c + w, x)); };
const SOLARA_MIN_LEVEL = 50;
const PORTALS: Record<string, { x: number; z: number; to: { x: number; z: number }; minLevel: number }> = {
  portal_a: { x: 14, z: 56, to: { x: 300, z: -7 }, minLevel: SOLARA_MIN_LEVEL },
  portal_b: { x: 300, z: -11, to: { x: 14, z: 52 }, minLevel: 0 },
};
const TOWNS = [{ x: 0, z: 5 }, { x: 300, z: 5 }];   // pontos de renascimento / retorno
const NPC_REACH = 8, PICK_REACH = 7, HIT_SLACK = 4;  // folgas por causa da latência

type Buff = { val: number; until: number };
type Sess = {
  client: Client; acc: AuthUser; charId: string; c: any; stash: any[]; potAt?: number;
  t: number; budget: number; lastChat: number; lastRecall: number; lastPortal: number; lastRevive: number;
  dirty: boolean; saving: boolean; d: any;
  tokens: number; tokT: number;
  cd: number[]; lastBasic: number; buffs: Record<string, Buff>; cst: number; cstAt: number; lastSkill: number; lastSkillAt: number; dag?: { id: number; st: string; ret?: () => void };
  drops: Map<number, { item: any; x: number; z: number; exp: number }>; dropSeq: number;
  partyId: number; clone?: { n: number; mult: number; until: number };
};
type Party = { id: number; leader: string; members: string[] };

export class WorldRoom extends Room<WorldState> {
  maxClients = 100;
  private sess = new Map<string, Sess>();
  private sim!: MonsterSim;
  private dg!: Dungeons;
  private parties = new Map<number, Party>();
  private partySeq = 0;
  private invites = new Map<string, { from: string; until: number }>();

  /* ---------- utilidades ---------- */
  private S(client: Client) { return this.sess.get(client.sessionId); }
  private stats(s: Sess) { const g = (s.c.gmu || 0) > Date.now(); if (s.d && !!s.d.gm !== g) s.d = null; return s.d || (s.d = R.stats(s.c)); }
  private touch(s: Sess) { s.d = null; s.dirty = true; }
  private buff(s: Sess, k: string) { const b = s.buffs[k]; return b && b.until > Date.now() ? b.val : 0; }
  private addBuff(s: Sess, k: string, val: number, dur: number) { s.buffs[k] = { val, until: Date.now() + dur * 1000 }; }
  private okRate(s: Sess, cost = 1) {            // balde de fichas por jogador (contra spam de mensagens)
    const now = Date.now(); s.tokens = Math.min(30, s.tokens + (now - s.tokT) / 1000 * 12); s.tokT = now;
    if (s.tokens < cost) return false; s.tokens -= cost; return true;
  }
  private sync(s: Sess) { if (s.c.gm) s.c.gold = R.GM_GOLD; const p = this.state.players.get(s.client.sessionId); if (p) { const ap = R.apOf(s.c); if (p.ap !== ap) p.ap = ap; const tt = s.c.title || ""; if (p.tt !== tt) p.tt = tt; const gb = (s.c.gmu || 0) > Date.now() ? 1 : 0; if (p.gb !== gb) p.gb = gb; } s.client.send("sync", { c: s.c, st: s.stash }); }
  private res(s: Sess, out: any[], ok = true) { s.client.send("res", { ok, out }); }
  private addDrop(s: Sess, item: any, x: number, z: number, life: number) {
    const id = ++s.dropSeq;
    s.drops.set(id, { item, x, z, exp: Date.now() + (life ? life : 600_000) + 3000 });
    s.client.send("drop", { id, item, x, z, life });
  }
  /* ---------- grupos ---------- */
  partyOf(s: Sess): Party | undefined { return s.partyId ? this.parties.get(s.partyId) : undefined; }
  private sendParty(pt: Party) {
    const members = pt.members.map((sid) => { const p = this.state.players.get(sid); return p ? { n: p.name, cls: p.cls, lv: p.level, dg: p.inst > 0 ? 1 : 0 } : null; }).filter(Boolean);
    const leader = this.state.players.get(pt.leader)?.name || "";
    for (const sid of pt.members) this.sess.get(sid)?.client.send("party", { leader, members });
  }
  private sysTo(s: Sess | undefined, text: string) { s?.client.send("chat", { kind: "sys", text }); }
  private partyLeave(sid: string, note?: string) {
    const s = this.sess.get(sid); if (!s) return; const pt = this.partyOf(s); s.partyId = 0;
    s.client.send("party", null);
    if (!pt) return;
    pt.members = pt.members.filter((x) => x !== sid);
    const nm = this.state.players.get(sid)?.name || "Jogador";
    if (pt.members.length < 2) {
      for (const m of pt.members) { const o = this.sess.get(m); if (o) { o.partyId = 0; o.client.send("party", null); this.sysTo(o, "O grupo foi desfeito."); } }
      this.parties.delete(pt.id); return;
    }
    if (pt.leader === sid) { pt.leader = pt.members[0]; }
    for (const m of pt.members) this.sysTo(this.sess.get(m), note || `${nm} saiu do grupo.`);
    this.sendParty(pt);
  }
  private findByName(name: string) { for (const [sid, s] of this.sess) if (this.state.players.get(sid)?.name.toLowerCase() === String(name).toLowerCase()) return s; return undefined; }

  private playerOf(s: Sess) { return this.state.players.get(s.client.sessionId)!; }

  async save(s: Sess) {
    if (s.saving) return; s.saving = true; s.dirty = false;
    try {
      const p = this.state.players.get(s.client.sessionId);
      if (p) s.c.pos = { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
      await saveChar(s.acc.id, s.c); await saveStash(s.acc.id, s.stash);
    } catch (e) { s.dirty = true; console.error("save", e); } finally { s.saving = false; }
  }
  async saveAll() { await Promise.all([...this.sess.values()].map((s) => this.save(s))); }

  /* ---------- combate ---------- */
  private hit(s: Sess, sim: Sim, mult: number, o: any = {}) {
    if (!sim.m.alive) return;
    const sid = s.client.sessionId, p = this.state.players.get(sid);
    if (!p || p.dead) return;
    const buffs = { dmg: this.buff(s, "dmg"), defdmg: this.buff(s, "defdmg"), crit: this.buff(s, "crit"), combo: this.buff(s, "combo") };
    const r = R.hitDamage(this.stats(s), { mult, defMult: o.defMult, exec: o.exec, forceCrit: o.forceCrit, marked: Date.now() < sim.markUntil, buffs }, { def: sim.def * (1 - (o.pierce || 0)), hp: sim.m.hp, maxHp: sim.m.maxHp });
    const died = this.sim.damage(sid, sim, r.dmg, o.slow || 0);
    this.broadcast("dmg", { id: sim.m.id, d: r.dmg, c: r.crit ? 1 : 0, by: sid });
    if (died) { this.onKill(sim); return; }
    if (o.stun || o.root || o.lift || o.pull) this.sim.cc(sim, o, p.x, p.z);
    const cl = s.clone;                                         // Pierrot: os clones atacam junto
    if (!o.noClone && cl && cl.until > Date.now()) for (let n = 0; n < cl.n; n++) this.later(110 + n * 80, () => this.hit(s, sim, mult * cl.mult, { noClone: true }));
  }
  private hitNear(s: Sess, x: number, z: number, r: number, mult: number, o: any, seen: Set<Sim>) {
    const inst = this.playerOf(s)?.inst || 0;
    for (const sim of this.sim.list) if (!seen.has(sim) && sim.m.alive && sim.inst === inst && cx(sim.m.x) === cx(x) && Math.hypot(sim.m.x - x, sim.m.z - z) <= r + 0.5 * sim.bs) { seen.add(sim); this.hit(s, sim, mult, o); }
  }
  private hitLine(s: Sess, x: number, z: number, ux: number, uz: number, len: number, w: number, mult: number, o: any) {
    const inst = this.playerOf(s)?.inst || 0;
    for (const sim of this.sim.list) {
      if (!sim.m.alive || sim.inst !== inst || cx(sim.m.x) !== cx(x)) continue;
      const rx = sim.m.x - x, rz = sim.m.z - z, t = rx * ux + rz * uz, pd = Math.abs(rx * uz - rz * ux);
      if (t >= -0.5 && t <= len && pd <= w / 2 + 0.5 * sim.bs) this.hit(s, sim, mult, o);
    }
  }
  private hitArea(s: Sess, x: number, z: number, r: number, mult: number, o: any) {
    const inst = this.playerOf(s)?.inst || 0;
    for (const sim of this.sim.list) if (sim.m.alive && sim.inst === inst && cx(sim.m.x) === cx(x) && Math.hypot(sim.m.x - x, sim.m.z - z) <= r + 0.5 * sim.bs) this.hit(s, sim, mult, o);
  }
  private later(ms: number, fn: () => void) { setTimeout(() => { try { fn(); } catch (e) { console.error(e); } }, ms); }

  private onKill(sim: Sim) {
    if (sim.T.dummy) return;                                    // espantalho de treino: sem XP, drop ou missão
    const T = sim.T, mlvl = sim.m.lvl, mx = sim.m.x, mz = sim.m.z;
    if (T.chest) { this.dg.onKill(sim); return; }          // baú de dungeon: o prêmio é entregue pela instância
    let total = 0; sim.contrib.forEach((v) => (total += v));
    sim.contrib.forEach((dmg, sid) => {
      const s = this.sess.get(sid); if (!s) return;
      const share = total > 0 ? dmg / total : 0;
      if (share < 0.1 && sid !== sim.lastHitBy) return;               // quem só encostou não ganha
      const c = s.c, out: any[] = [];
      const xp = Math.max(1, Math.round(R.xpFor(T, mlvl, c.level) * Math.min(1, 0.4 + share)));
      c.kills = (c.kills || 0) + 1;
      out.push({ log: `<span style="color:#ffd27a">${T.n} Nv ${mlvl} derrotado! +${xp} XP</span>` });
      if (R.gainXp(c, xp)) { out.push({ lvl: c.level }); const p = this.state.players.get(sid); if (p) p.level = c.level; }
      out.push(...R.questKill(c, sim.m.type));
      this.touch(s); this.sync(s); this.res(s, out);
      for (const it of R.rollLoot(T, mlvl, c.cls, R.luckOf(c, this.buff(s, "luck")))) this.addDrop(s, it, mx, mz, 0);
    });
    if (sim.inst) this.dg.onKill(sim);
  }

  private cast(s: Sess, m: any) {
    const p = this.playerOf(s); if (!p || p.dead) return;
    const c = s.c, C = R.CLASSES[c.cls], i = m?.i;
    if (!Number.isInteger(i) || i < 0 || i >= C.skills.length) return;
    const rank = c.sk[i] || 0; if (!rank || c.level < C.skills[i].lv) return;
    const sk = R.skStat(c.cls, i, rank), now = Date.now();
    if (C.skills[i].type === "daggerFan" && s.dag && s.dag.st === "stuck" && s.dag.ret) {      // chamar as adagas de volta
      s.dag.ret();
      this.broadcast("fx", { by: s.client.sessionId, i, rc: 1, x: p.x, z: p.z }, { except: s.client });
      return;
    }
    if (now < s.cd[i] - 300) return;                                   // recarga (com folga de latência)
    const off = !["buff", "dashBack", "heal", "clone"].includes(sk.type);
    if (off && R.inTown(p.x, p.z)) return;
    let tgt: Sim | undefined;
    if (["single", "dash", "aoeTarget", "multi", "barrage", "mark"].includes(sk.type)) {
      tgt = this.sim.byId.get(Number(m?.tid));
      if (!tgt || !tgt.m.alive || tgt.inst !== p.inst || cx(tgt.m.x) !== cx(p.x) || Math.hypot(tgt.m.x - p.x, tgt.m.z - p.z) > sk.range + HIT_SLACK) return;
    }
    s.cd[i] = now + sk.cd * 1000;
    let mult = sk.mult;
    if (C.combo) {
      const prevOk = s.lastSkill >= 0 && now - s.lastSkillAt < 3500;
      if (!(now - s.cstAt < 4500)) s.cst = 0;
      const cb = !!(sk.after && prevOk && sk.after.includes(s.lastSkill));
      s.cst = Math.min(5, s.cst + 1); s.cstAt = now; this.addBuff(s, "combo", s.cst * 0.08, 4.5);
      if (cb) { mult *= 1 + (sk.cbonus || 0.5); if (sk.reset) for (const j of sk.reset) s.cd[j] = 0; }
      if (sk.mark && tgt) tgt.markUntil = now + sk.mark * 1000;
    }
    s.lastSkill = i; s.lastSkillAt = now;
    let star: Sim[] = [];
    if (sk.type === "starJump") {
      const ids: any[] = Array.isArray(m?.tids) ? m.tids.slice(0, sk.jumps) : [];
      for (const id of ids) { const q = this.sim.byId.get(Number(id)); if (q && q.m.alive && !star.includes(q) && q.inst === p.inst && cx(q.m.x) === cx(p.x) && Math.hypot(q.m.x - p.x, q.m.z - p.z) <= sk.range + 6) star.push(q); }
      if (!star.length) { s.cd[i] = 0; return; }
    }
    let ux = 0, uz = 1;                    // direção da habilidade (Escudo Voador / Raio do Escudo)
    if (Number.isFinite(m?.dx) && Number.isFinite(m?.dz)) { const dl = Math.hypot(m.dx, m.dz); if (dl > 0.01) { ux = m.dx / dl; uz = m.dz / dl; } }
    this.broadcast("fx", { by: s.client.sessionId, i, tid: tgt ? tgt.m.id : 0, x: p.x, z: p.z, dx: ux, dz: uz, n: sk.dag || 0, tids: star.map((q) => q.m.id) }, { except: s.client });
    const pr = sk.proj || (C.ranged ? C.proj : null), so = { slow: sk.slow, defMult: sk.defMult, exec: sk.exec, stun: sk.stun, root: sk.root, lift: sk.lift, pull: sk.pull, forceCrit: sk.forceCrit, pierce: sk.pierce };
    const flight = tgt ? Math.max(0.2, Math.hypot(tgt.m.x - p.x, tgt.m.z - p.z)) / 24 * 1000 : 0;
    const px = p.x, pz = p.z;
    switch (sk.type) {
      case "single": this.later(pr ? flight : 150, () => tgt && this.hit(s, tgt, mult, so)); break;
      case "multi": for (let h = 0; h < sk.hits; h++) this.later(h * 190 + (pr ? flight : 0), () => tgt && this.hit(s, tgt, mult)); break;
      case "aoeSelf": this.later(sk.delay || 200, () => { const q = this.playerOf(s); this.hitArea(s, sk.delay && q ? q.x : px, sk.delay && q ? q.z : pz, sk.radius, mult, so); }); break;
      case "shieldThrow": {                 // escudo voa (perfura), gira 2s no alcance máximo (área) e volta
        const SPD = 16, tOut = (sk.range / SPD) * 1000, sx = p.x, sz = p.z, ex = sx + ux * sk.range, ez = sz + uz * sk.range;
        const seen1 = new Set<Sim>(), seen2 = new Set<Sim>();
        for (let t = 0; t <= tOut; t += 100) this.later(300 + t, () => { const f = t / tOut; this.hitNear(s, sx + (ex - sx) * f, sz + (ez - sz) * f, 1.8, mult, so, seen1); });
        for (let k = 1; k <= 5; k++) this.later(300 + tOut + k * 400, () => this.hitArea(s, ex, ez, 3.4, mult * 0.45, so));
        for (let t = 0; t <= tOut; t += 100) this.later(300 + tOut + 2000 + t, () => { const q = this.playerOf(s); if (!q) return; const f = t / tOut; this.hitNear(s, ex + (q.x - ex) * f, ez + (q.z - ez) * f, 1.8, mult, so, seen2); });
        break;
      }
      case "shieldBeam": {                  // raio fixo na direção do golpe por 3s (perfurante)
        for (let k = 0; k < 10; k++) this.later(350 + k * 300, () => { const q = this.playerOf(s); if (q && !q.dead) this.hitLine(s, q.x, q.z, ux, uz, sk.range, 1.5, mult, so); });
        break;
      }
      case "aoeMulti": for (let h = 0; h < sk.hits; h++) this.later(200 + h * 200, () => this.hitArea(s, p.x, p.z, sk.radius, mult, so)); break;
      case "taunt": {
        for (const k in sk.buffs) this.addBuff(s, k, sk.buffs[k], sk.dur);
        for (const sim of this.sim.list) if (sim.m.alive && sim.inst === p.inst && cx(sim.m.x) === cx(p.x) && Math.hypot(sim.m.x - px, sim.m.z - pz) <= sk.radius) this.sim.taunt(sim, s.client.sessionId, sk.dur * 1000);
        break;
      }
      case "clone": s.clone = { n: sk.clones, mult: sk.cloneMult, until: now + sk.dur * 1000 }; this.broadcast("clones", { by: s.client.sessionId, n: sk.clones, dur: sk.dur }); break;
      case "aoeTarget": { const tx = tgt!.m.x, tz = tgt!.m.z; this.later(sk.meteor ? 600 : 650, () => this.hitArea(s, tx, tz, sk.radius, mult, so)); break; }
      case "barrage": case "dash": {
        const dx = tgt!.m.x - p.x, dz = tgt!.m.z - p.z, d = Math.hypot(dx, dz) || 1, mv = Math.max(0, d - (sk.type === "dash" ? 1.7 : 1.6));
        p.x = clampX(p.x + (dx / d) * mv, p.x); p.z = clamp(p.z + (dz / d) * mv); s.t = now;
        if (sk.type === "dash") this.later(120, () => this.hit(s, tgt!, mult, so));
        else {
          for (let h = 0; h < sk.hits; h++) this.later(150 + h * 130, () => this.hit(s, tgt!, mult));
          this.later(200 + sk.hits * 130, () => { for (let j = 0; j < 8; j++) if (j !== i) s.cd[j] = 0; });
        }
        break;
      }
      case "mark": break;                                                        // só marca (já feito acima), sem dano
      case "cloak": {
        for (const k in sk.buffs) this.addBuff(s, k, sk.buffs[k], sk.dur);
        this.sim.hidden.set(s.client.sessionId, now + sk.dur * 1000);
        break;
      }
      case "starJump": {                    // pula em até 5 monstros, um após o outro
        star.forEach((q, n) => this.later(520 + n * 520, () => {
          const pp = this.playerOf(s); if (!pp || pp.dead || !q.m.alive) return;
          const dx = q.m.x - pp.x, dz = q.m.z - pp.z, d = Math.hypot(dx, dz) || 1, mv = Math.max(0, d - 1.2);
          pp.x = clampX(pp.x + (dx / d) * mv, pp.x); pp.z = clamp(pp.z + (dz / d) * mv); s.t = Date.now();
          s.budget = BURST; this.later(40, () => this.hit(s, q, mult, so));
        }));
        break;
      }
      case "daggerFan": {                   // leque de adagas: voam, ficam presas 2s e voltam (recall ao reutilizar)
        const n = Math.max(1, sk.dag || 1), STEP = 0.42, SPD = 24, tFly = (sk.range / SPD) * 1000, id = (s.dag?.id || 0) + 1;
        const dg = { id, st: "fly" as string, ret: undefined as undefined | (() => void) }; s.dag = dg;
        const sx = p.x, sz = p.z, base = Math.atan2(ux, uz), ends: { x: number; z: number }[] = [], seen = new Set<Sim>();
        for (let j = 0; j < n; j++) { const a = base + (j - (n - 1) / 2) * STEP; ends.push({ x: sx + Math.sin(a) * sk.range, z: sz + Math.cos(a) * sk.range }); }
        ends.forEach((e) => { for (let t = 0; t <= tFly; t += 100) this.later(t, () => { const f = t / tFly; this.hitNear(s, sx + (e.x - sx) * f, sz + (e.z - sz) * f, 1.0, mult * 0.5, so, seen); }); });
        this.later(tFly, () => { if (s.dag === dg) { dg.st = "stuck"; ends.forEach((e) => this.hitArea(s, e.x, e.z, 1.9, mult, so)); } });
        let back = false;
        const ret = () => {
          if (back || s.dag !== dg) return; back = true; dg.st = "ret";
          const seen2: Set<Sim>[] = ends.map(() => new Set<Sim>());
          ends.forEach((e, j) => { for (let t = 0; t <= tFly; t += 100) this.later(t, () => { const q = this.playerOf(s); if (!q) return; const f = t / tFly; this.hitNear(s, e.x + (q.x - e.x) * f, e.z + (q.z - e.z) * f, 1.2, mult, so, seen2[j]); }); });
          this.later(tFly + 50, () => { if (s.dag === dg) s.dag = undefined; });
        };
        dg.ret = ret;
        this.later(tFly + 2000, ret);
        break;
      }
      case "dashBack": case "buff": for (const k in sk.buffs) this.addBuff(s, k, sk.buffs[k], sk.dur); break;
    }
  }

  private basic(s: Sess, m: any) {
    const p = this.playerOf(s); if (!p || p.dead || R.inTown(p.x, p.z)) return;
    const C = R.CLASSES[s.c.cls], now = Date.now(), d = this.stats(s);
    if (now - s.lastBasic < (900 / d.atkSpd) * 0.7) return;
    const tgt = this.sim.byId.get(Number(m?.tid));
    if (!tgt || !tgt.m.alive || tgt.inst !== p.inst || cx(tgt.m.x) !== cx(p.x) || Math.hypot(tgt.m.x - p.x, tgt.m.z - p.z) > C.range + HIT_SLACK) return;
    s.lastBasic = now;
    this.broadcast("matk", { by: s.client.sessionId, tid: tgt.m.id }, { except: s.client });
    const flight = Math.max(0.2, Math.hypot(tgt.m.x - p.x, tgt.m.z - p.z)) / 24 * 1000;
    this.later(C.ranged ? flight : 130, () => this.hit(s, tgt, 1));
  }

  /* ---------- mensagens ---------- */
  onCreate() {
    this.setState(new WorldState());
    this.setPatchRate(50);
    this.sim = new MonsterSim(this.state, {
      hit: (sid, dmg, mid) => this.sess.get(sid)?.client.send("mhit", { raw: dmg, id: mid }),
      attack: (mid) => this.broadcast("mat", { id: mid }),
      slam: (x, z, r, inst) => this.broadcast("slam", { x, z, r, inst }),
    });
    this.dg = new Dungeons(this);
    let last = Date.now(), sweepAt = 0, saveAt = 0, dgAt = 0, gmAt = 0;
    this.setSimulationInterval(() => {
      const now = Date.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
      if (this.clients.length) this.sim.update(dt);
      if (now > sweepAt) {
        sweepAt = now + 2000;
        for (const s of this.sess.values()) for (const [id, d] of s.drops) if (now > d.exp) s.drops.delete(id);
      }
      if (now > gmAt) { gmAt = now + 1000; for (const s of this.sess.values()) if (s.c.gmu && s.c.gmu <= now) { s.c.gmu = 0; this.touch(s); this.sync(s); s.client.send("gmb", { on: 0 }); } }
      if (now > dgAt) { dgAt = now + 1000; this.dg.tick(now); }
      if (now > saveAt) { saveAt = now + 12_000; for (const s of this.sess.values()) if (s.dirty) this.save(s); }
    }, 50);

    this.onMessage("move", (client, m) => {
      const p = this.state.players.get(client.sessionId), s = this.S(client);
      if (!p || !s || p.dead || !Number.isFinite(m?.x) || !Number.isFinite(m?.z)) return;
      const now = Date.now();
      s.budget = Math.min(BURST, s.budget + ((now - s.t) / 1000) * RATE);
      s.t = now;
      let x = clampX(m.x, p.x), z = clamp(m.z);   // não dá para cruzar de região andando: só pelo portal
      if (p.inst) { const I = this.dg.insts.get(p.inst); if (I) z = Math.min(z, this.dg.maxZ(I) - 0.5); }   // portões da dungeon
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d > s.budget) {                          // rápido demais: limita e corrige o cliente
        const k = s.budget / d;
        x = p.x + dx * k; z = p.z + dz * k;
        s.budget = 0;
        client.send("correct", { x, z });
      } else s.budget -= d;
      p.x = x; p.z = z;
    });

    // Ações de economia/inventário: o servidor valida tudo e devolve o resultado (nunca confia no cliente).
    this.onMessage("a", (client, m) => {
      const s = this.S(client), p = this.state.players.get(client.sessionId);
      if (!s || !p || !m || typeof m.t !== "string" || m.t === "died" || !this.okRate(s, 1)) return;
      if (m.t === "ack") { delete s.c._respec; this.touch(s); return; }
      const near = (n: any) => !!n && cx(n.x) === cx(p.x) && Math.hypot(n.x - p.x, n.z - p.z) <= NPC_REACH;
      const r = R.act(s, m, { near, now: Date.now() });
      for (const sp of r.spawn) this.addDrop(s, sp.item, p.x, p.z, sp.life);
      p.level = s.c.level; this.touch(s);
      this.sync(s); this.res(s, r.out, r.ok);
    });
    this.onMessage("cast", (client, m) => { const s = this.S(client); if (s && this.okRate(s, 0.5)) this.cast(s, m); });
    this.onMessage("atk", (client, m) => { const s = this.S(client); if (s && this.okRate(s, 0.5)) this.basic(s, m); });
    this.onMessage("pick", (client, m) => {
      const s = this.S(client), p = this.state.players.get(client.sessionId);
      if (!s || !p || p.dead || !this.okRate(s, 1)) return;
      const d = s.drops.get(Number(m?.id)); if (!d) return;
      if (Math.hypot(d.x - p.x, d.z - p.z) > PICK_REACH) return;
      const c = s.c, it = d.item, id = Number(m.id);
      let out: any[];
      if (it.k === "gold") { c.gold += it.n; out = [{ sfx: "coin" }, { float: { t: "+" + it.n + " 💰", c: "#ffe28a" } }]; }
      else {
        if (!R.canAdd(c.inv, it)) return this.res(s, [{ toast: "Mochila cheia!" }], false);
        const label = R.nm(it) + (it.n > 1 ? " ×" + it.n : "");
        R.addItem(c.inv, it);
        out = [{ sfx: "pickup" }, { log: `Você obteve <b style="color:${it.k === "eq" ? R.RAR[it.rar].c : "#fff"}">${label}</b>` }];
      }
      s.drops.delete(id); client.send("drm", { id });
      this.touch(s); this.sync(s); this.res(s, out);
    });

    this.onMessage("died", (client) => {
      const s = this.S(client), p = this.state.players.get(client.sessionId);
      if (!s || !p || p.dead) return;
      p.dead = true;
      const r = R.act(s, { t: "died" }, { now: Date.now() });
      this.touch(s); this.sync(s); this.res(s, r.out);
    });

    this.onMessage("recall", (client) => {       // teleporte para a cidade mais próxima (sem aceitar coordenadas do cliente)
      const p = this.state.players.get(client.sessionId), s = this.S(client);
      if (!p || !s || p.dead) return;
      if (p.inst) { this.sysTo(s, "O retorno não funciona dentro da dungeon. Use o portal de saída."); return; }
      const now = Date.now();
      if (now - s.lastRecall < 10_000) return;
      s.lastRecall = now;
      const t = TOWNS.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      p.x = t.x; p.z = t.z; s.budget = BURST; s.t = now;
    });

    this.onMessage("portal", (client, m) => {
      const p = this.state.players.get(client.sessionId), s = this.S(client);
      const g = PORTALS[String(m?.id)];
      if (!p || !s || !g || p.dead || p.inst) return;
      const now = Date.now();
      if (now - s.lastPortal < 1500) return;
      if (Math.hypot(p.x - g.x, p.z - g.z) > 9) return;
      if (s.c.level < g.minLevel) { client.send("chat", { kind: "sys", text: `O portal só abre a partir do nível ${g.minLevel}.` }); return; }
      s.lastPortal = now;
      p.x = g.to.x; p.z = g.to.z; s.budget = BURST; s.t = now;
    });

    this.onMessage("revive", (client) => {
      const p = this.state.players.get(client.sessionId), s = this.S(client);
      if (!p || !s) return;
      const now = Date.now();
      if (now - s.lastRevive < 3_000) return;
      s.lastRevive = now; p.dead = false;
      if (p.inst) { const I = this.dg.insts.get(p.inst); if (I) { p.x = I.def.cx; p.z = I.def.start.z; s.budget = BURST; s.t = now; return; } }
      const t = TOWNS.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      p.x = t.x; p.z = t.z; s.budget = BURST; s.t = now;
    });

    /* ---- dungeon ---- */
    this.onMessage("dgenter", (client, m) => {
      const s = this.S(client); if (!s || !this.okRate(s, 2)) return;
      const p = this.playerOf(s); if (!p || p.dead) return;
      const err = this.dg.enter(s, String(m?.id));
      if (err) this.res(s, [{ toast: err }], false); else { this.touch(s); this.sync(s); const pt = this.partyOf(s); if (pt) this.sendParty(pt); }
    });
    this.onMessage("dgexit", (client) => {
      const s = this.S(client), p = this.state.players.get(client.sessionId); if (!s || !p || !p.inst) return;
      const I = this.dg.insts.get(p.inst);
      const atEnd = !!(I && I.done && I.def.exitZ !== undefined && Math.hypot(p.x - I.def.cx, p.z - I.def.exitZ) <= 14);
      if (I && p.z > I.def.start.z + 9 && !atEnd) { this.res(s, [{ toast: I.done ? "Vá até o portal de saída, no fim da cripta." : "Vá até o portal de saída, no começo da cripta." }], false); return; }
      this.dg.leave(s, true); this.touch(s); this.sync(s);
      this.res(s, [{ log: '<span style="color:#9fe7b0">🚪 Você saiu da dungeon. Seu ingresso continua válido por <b>5 minutos</b> — volte pelo portal da cripta para continuar.</span>' }]);
      const pt = this.partyOf(s); if (pt) this.sendParty(pt);
    });
    this.onMessage("dgtalk", (client, m) => { const s = this.S(client); if (s && this.okRate(s, 1)) this.dg.talk(s, String(m?.id)); });

    /* ---- grupos ---- */
    // Buff do GM: só personagens de conta GM. Modos: self | id (jogador clicado) | near (raio) | all (todos do mapa)
    this.onMessage("gmbuff", (client, m) => {
      const s = this.S(client), p = this.state.players.get(client.sessionId);
      if (!s || !p || !s.c.gm || !this.okRate(s, 1)) return;
      const mode = String(m?.mode || "id"), rad = Math.max(1, Math.min(60, Number(m?.r) || 30));
      const targets: Sess[] = [];
      for (const [sid, t] of this.sess) {
        const q = this.state.players.get(sid); if (!q) continue;
        const ok = mode === "self" ? sid === client.sessionId : mode === "id" ? sid === String(m?.id) : mode === "near" ? q.inst === p.inst && Math.hypot(q.x - p.x, q.z - p.z) <= rad : mode === "all" ? true : false;
        if (ok) targets.push(t);
      }
      const until = Date.now() + 5 * 60_000;
      for (const t of targets) { t.c.gmu = until; this.touch(t); this.sync(t); t.client.send("gmb", { on: 1, until, by: s.c.name }); }
      s.client.send("res", { ok: true, out: [{ toast: targets.length ? "✨ Buff do GM aplicado em " + targets.length + " jogador(es) por 5 min" : "Nenhum jogador encontrado" }] });
    });
    // GM: teletransporte pelo minimapa (só no mundo aberto e dentro da região atual)
    this.onMessage("gmtp", (client, m) => {
      const p = this.state.players.get(client.sessionId), s = this.S(client);
      if (!p || !s || !s.c.gm || p.inst || !Number.isFinite(m?.x) || !Number.isFinite(m?.z)) return;
      const x = clampX(m.x, p.x), z = clamp(m.z);
      p.x = x; p.z = z; s.budget = BURST; s.t = Date.now();
      client.send("correct", { x, z });
    });
    this.onMessage("hp", (client, m) => {      // vida informada pelo cliente: usada só nas barras do grupo
      const p = this.state.players.get(client.sessionId);
      if (!p || !Number.isFinite(m?.hp) || !Number.isFinite(m?.max)) return;
      const mx = Math.max(1, Math.min(4_000_000, Math.round(m.max))), hp = Math.max(0, Math.min(mx, Math.round(m.hp)));
      if (p.hp !== hp) p.hp = hp; if (p.mhp !== mx) p.mhp = mx;
    });
    this.onMessage("pinvite", (client, m) => {
      const s = this.S(client); if (!s || !this.okRate(s, 2)) return;
      const t = this.findByName(String(m?.name || ""));
      if (!t) return this.sysTo(s, `Jogador "${String(m?.name || "").slice(0, 16)}" não está online.`);
      if (t === s) return;
      const pt = this.partyOf(s);
      if (pt && pt.leader !== client.sessionId) return this.sysTo(s, "Só o líder do grupo pode convidar.");
      if (pt && pt.members.length >= 6) return this.sysTo(s, "O grupo está cheio (6 jogadores).");
      if (t.partyId) return this.sysTo(s, "Esse jogador já está em um grupo.");
      this.invites.set(t.client.sessionId, { from: client.sessionId, until: Date.now() + 30_000 });
      t.client.send("pinv", { from: this.state.players.get(client.sessionId)?.name });
      this.sysTo(s, `Convite enviado para ${this.state.players.get(t.client.sessionId)?.name}.`);
    });
    this.onMessage("pans", (client, m) => {
      const s = this.S(client), iv = this.invites.get(client.sessionId); this.invites.delete(client.sessionId);
      if (!s || !iv || Date.now() > iv.until) return;
      const f = this.sess.get(iv.from); if (!f) return this.sysTo(s, "Quem convidou saiu do jogo.");
      if (!m?.ok) return this.sysTo(f, `${this.state.players.get(client.sessionId)?.name} recusou o convite.`);
      if (s.partyId) return;
      let pt = this.partyOf(f);
      if (!pt) { pt = { id: ++this.partySeq, leader: iv.from, members: [iv.from] }; this.parties.set(pt.id, pt); f.partyId = pt.id; }
      if (pt.members.length >= 6) return this.sysTo(s, "O grupo está cheio.");
      pt.members.push(client.sessionId); s.partyId = pt.id;
      const nm = this.state.players.get(client.sessionId)?.name;
      for (const sid of pt.members) this.sysTo(this.sess.get(sid), `${nm} entrou no grupo.`);
      this.sendParty(pt);
    });
    this.onMessage("pleave", (client) => this.partyLeave(client.sessionId));
    this.onMessage("pkick", (client, m) => {
      const s = this.S(client); const pt = s && this.partyOf(s); if (!s || !pt || pt.leader !== client.sessionId) return;
      const t = this.findByName(String(m?.name || "")); if (!t || t === s || t.partyId !== pt.id) return;
      this.sysTo(t, "Você foi removido do grupo."); this.partyLeave(t.client.sessionId, `${this.state.players.get(t.client.sessionId)?.name} foi removido do grupo.`);
    });

    this.onMessage("chat", (client, m) => {
      const p = this.state.players.get(client.sessionId), s = this.S(client);
      if (!p || !s || typeof m?.text !== "string") return;
      const now = Date.now();
      if (now - s.lastChat < 700) return;
      s.lastChat = now;
      const text = m.text.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200);
      if (!text) return;
      const g = /^\/p\s+([\s\S]+)$/i.exec(text);
      if (g) {
        const pt = this.partyOf(s); if (!pt) return client.send("chat", { kind: "sys", text: "Você não está em um grupo." });
        for (const sid of pt.members) this.sess.get(sid)?.client.send("chat", { kind: "p", from: p.name, text: g[1] });
        return;
      }
      const w = /^\/w\s+(\S+)\s+([\s\S]+)$/i.exec(text);
      if (w) {
        const target = this.clients.find((c) => this.state.players.get(c.sessionId)?.name.toLowerCase() === w[1].toLowerCase());
        if (!target) return client.send("chat", { kind: "sys", text: `Jogador "${w[1]}" não está online.` });
        const msg = { kind: "w", from: p.name, text: w[2] };
        target.send("chat", msg);
        if (target !== client) client.send("chat", { ...msg, from: `para ${w[1]}` });
        return;
      }
      this.broadcast("chat", { kind: "g", from: p.name, text });
    });
  }

  async onAuth(_c: Client, options: any) {
    const acc = verifyToken(options?.token);
    if (!acc) throw new ServerError(401, "Sessão inválida.");
    const c = await loadCharacter(acc.id, String(options?.charId || ""));
    if (!c) throw new ServerError(404, "Personagem não encontrado.");
    const stash = await loadStash(acc.id);
    return { acc, c, stash };
  }

  onJoin(client: Client, options: any, authData?: any) {
    const a = authData as { acc: AuthUser; c: any; stash: any[] };
    for (const [sid, o] of this.sess)            // uma sessão por conta
      if (o.acc.id === a.acc.id) { this.clients.find((cl) => cl.sessionId === sid)?.leave(4001); }
    const c = a.c, p = new Player();
    p.name = c.name; p.cls = c.cls; p.level = c.level;
    const pos = c.pos && Number.isFinite(c.pos.x) && Number.isFinite(c.pos.z) ? c.pos : { x: Number.isFinite(options?.x) ? options.x : 0, z: Number.isFinite(options?.z) ? options.z : 5 };
    p.x = clampX(pos.x, pos.x); p.z = clamp(pos.z);
    if (p.x > 150 && p.x < 450 && c.level < SOLARA_MIN_LEVEL) { p.x = 0; p.z = 5; }
    this.state.players.set(client.sessionId, p);
    const now = Date.now();
    const s: Sess = { client, acc: a.acc, charId: c.id, c, stash: a.stash, t: now, budget: BURST, lastChat: 0, lastRecall: 0, lastPortal: 0, lastRevive: 0,
      dirty: true, saving: false, d: null, tokens: 30, tokT: now, cd: Array(8).fill(0), lastBasic: 0, buffs: {}, cst: 0, cstAt: 0, lastSkill: -1, lastSkillAt: 0, drops: new Map(), dropSeq: 0, partyId: 0 };
    this.sess.set(client.sessionId, s);
    if (p.x > 450) {                                            // estava numa dungeon: volta para a instância se ainda estiver no prazo
      const I = c.run ? this.dg.insts.get(c.run.inst) : undefined;
      if (I && !I.closed && c.run.until && Date.now() < c.run.until) {
        I.members.add(client.sessionId); I.emptySince = 0; delete c.run.until; p.inst = I.id; p.z = Math.min(p.z, this.dg.maxZ(I) - 0.5);
        client.send("dgenter", { id: I.def.id, inst: I.id, cx: I.def.cx, x: p.x, z: p.z }); this.dg.sendState(I, client.sessionId);
      } else { const e = this.dg.entryOf(R.DUNGEONS[0]); p.x = e.x; p.z = e.z; delete c.run; client.send("dgleave", { reason: "A dungeon se fechou enquanto você estava fora.", x: e.x, z: e.z }); }
    } else if (c.run) delete c.run;
    this.sync(s);
    this.broadcast("chat", { kind: "sys", text: `${p.name} entrou no mundo.` }, { except: client });
  }

  async onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId), s = this.sess.get(client.sessionId);
    if (p) this.broadcast("chat", { kind: "sys", text: `${p.name} saiu do mundo.` }, { except: client });
    if (s) { this.dg.leave(s, false); this.partyLeave(client.sessionId); this.invites.delete(client.sessionId); s.saving = false; await this.save(s); }
    this.state.players.delete(client.sessionId);
    this.sess.delete(client.sessionId);
    for (const sim of this.sim.list) sim.contrib.delete(client.sessionId);
  }

  async onDispose() { await this.saveAll(); }
}
