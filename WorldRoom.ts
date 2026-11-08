import { Room, Client, ServerError } from "colyseus";
import { WorldState, Player } from "./schema";
import { verifyToken, loadCharacter, loadStash, saveChar, saveStash, AuthUser } from "./auth";
import { MonsterSim, Sim } from "./monsters";
const R: any = require("./rules.js");

const MAP = 80;          // mesmo limite do cliente
const RATE = 14;         // unidades/s sustentadas (jogador anda ~6-8)
const BURST = 20;        // folga para habilidades de avanço (ex.: Investida)
const clamp = (v: number) => Math.max(-MAP, Math.min(MAP, v));
// O mundo tem duas regiões de 160x160: a Vila Aurora (centro x=0) e Solara (centro x=300).
const cx = (x: number) => (x > 150 ? 300 : 0);
const clampX = (x: number, ref: number) => Math.max(cx(ref) - MAP, Math.min(cx(ref) + MAP, x));
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
  cd: number[]; lastBasic: number; buffs: Record<string, Buff>; cst: number; cstAt: number; lastSkill: number; lastSkillAt: number;
  drops: Map<number, { item: any; x: number; z: number; exp: number }>; dropSeq: number;
};

export class WorldRoom extends Room<WorldState> {
  maxClients = 100;
  private sess = new Map<string, Sess>();
  private sim!: MonsterSim;

  /* ---------- utilidades ---------- */
  private S(client: Client) { return this.sess.get(client.sessionId); }
  private stats(s: Sess) { return s.d || (s.d = R.stats(s.c)); }
  private touch(s: Sess) { s.d = null; s.dirty = true; }
  private buff(s: Sess, k: string) { const b = s.buffs[k]; return b && b.until > Date.now() ? b.val : 0; }
  private addBuff(s: Sess, k: string, val: number, dur: number) { s.buffs[k] = { val, until: Date.now() + dur * 1000 }; }
  private okRate(s: Sess, cost = 1) {            // balde de fichas por jogador (contra spam de mensagens)
    const now = Date.now(); s.tokens = Math.min(30, s.tokens + (now - s.tokT) / 1000 * 12); s.tokT = now;
    if (s.tokens < cost) return false; s.tokens -= cost; return true;
  }
  private sync(s: Sess) { s.client.send("sync", { c: s.c, st: s.stash }); }
  private res(s: Sess, out: any[], ok = true) { s.client.send("res", { ok, out }); }
  private addDrop(s: Sess, item: any, x: number, z: number, life: number) {
    const id = ++s.dropSeq;
    s.drops.set(id, { item, x, z, exp: Date.now() + (life ? life : 600_000) + 3000 });
    s.client.send("drop", { id, item, x, z, life });
  }
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
    const r = R.hitDamage(this.stats(s), { mult, defMult: o.defMult, exec: o.exec, marked: Date.now() < sim.markUntil, buffs }, { def: sim.def, hp: sim.m.hp, maxHp: sim.m.maxHp });
    const died = this.sim.damage(sid, sim, r.dmg, o.slow || 0);
    this.broadcast("dmg", { id: sim.m.id, d: r.dmg, c: r.crit ? 1 : 0, by: sid });
    if (died) this.onKill(sim);
  }
  private hitArea(s: Sess, x: number, z: number, r: number, mult: number, o: any) {
    for (const sim of this.sim.list) if (sim.m.alive && cx(sim.m.x) === cx(x) && Math.hypot(sim.m.x - x, sim.m.z - z) <= r + 0.5 * sim.bs) this.hit(s, sim, mult, o);
  }
  private later(ms: number, fn: () => void) { setTimeout(() => { try { fn(); } catch (e) { console.error(e); } }, ms); }

  private onKill(sim: Sim) {
    const T = sim.T, mlvl = sim.m.lvl, mx = sim.m.x, mz = sim.m.z;
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
      for (const it of R.rollLoot(T, mlvl, c.cls)) this.addDrop(s, it, mx, mz, 0);
    });
  }

  private cast(s: Sess, m: any) {
    const p = this.playerOf(s); if (!p || p.dead) return;
    const c = s.c, C = R.CLASSES[c.cls], i = m?.i;
    if (!Number.isInteger(i) || i < 0 || i >= C.skills.length) return;
    const rank = c.sk[i] || 0; if (!rank || c.level < C.skills[i].lv) return;
    const sk = R.skStat(c.cls, i, rank), now = Date.now();
    if (now < s.cd[i] - 300) return;                                   // recarga (com folga de latência)
    const off = !["buff", "dashBack", "heal"].includes(sk.type);
    if (off && R.inTown(p.x, p.z)) return;
    let tgt: Sim | undefined;
    if (["single", "dash", "aoeTarget", "multi", "barrage"].includes(sk.type)) {
      tgt = this.sim.byId.get(Number(m?.tid));
      if (!tgt || !tgt.m.alive || cx(tgt.m.x) !== cx(p.x) || Math.hypot(tgt.m.x - p.x, tgt.m.z - p.z) > sk.range + HIT_SLACK) return;
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
    this.broadcast("fx", { by: s.client.sessionId, i, tid: tgt ? tgt.m.id : 0, x: p.x, z: p.z }, { except: s.client });
    const pr = sk.proj || (C.ranged ? C.proj : null), so = { slow: sk.slow, defMult: sk.defMult, exec: sk.exec };
    const flight = tgt ? Math.max(0.2, Math.hypot(tgt.m.x - p.x, tgt.m.z - p.z)) / 24 * 1000 : 0;
    const px = p.x, pz = p.z;
    switch (sk.type) {
      case "single": this.later(pr ? flight : 150, () => tgt && this.hit(s, tgt, mult, so)); break;
      case "multi": for (let h = 0; h < sk.hits; h++) this.later(h * 190 + (pr ? flight : 0), () => tgt && this.hit(s, tgt, mult)); break;
      case "aoeSelf": this.later(200, () => this.hitArea(s, px, pz, sk.radius, mult, so)); break;
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
      case "dashBack": case "buff": for (const k in sk.buffs) this.addBuff(s, k, sk.buffs[k], sk.dur); break;
    }
  }

  private basic(s: Sess, m: any) {
    const p = this.playerOf(s); if (!p || p.dead || R.inTown(p.x, p.z)) return;
    const C = R.CLASSES[s.c.cls], now = Date.now(), d = this.stats(s);
    if (now - s.lastBasic < (900 / d.atkSpd) * 0.7) return;
    const tgt = this.sim.byId.get(Number(m?.tid));
    if (!tgt || !tgt.m.alive || cx(tgt.m.x) !== cx(p.x) || Math.hypot(tgt.m.x - p.x, tgt.m.z - p.z) > C.range + HIT_SLACK) return;
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
      slam: (x, z, r) => this.broadcast("slam", { x, z, r }),
    });
    let last = Date.now(), sweepAt = 0, saveAt = 0;
    this.setSimulationInterval(() => {
      const now = Date.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
      if (this.clients.length) this.sim.update(dt);
      if (now > sweepAt) {
        sweepAt = now + 2000;
        for (const s of this.sess.values()) for (const [id, d] of s.drops) if (now > d.exp) s.drops.delete(id);
      }
      if (now > saveAt) { saveAt = now + 12_000; for (const s of this.sess.values()) if (s.dirty) this.save(s); }
    }, 50);

    this.onMessage("move", (client, m) => {
      const p = this.state.players.get(client.sessionId), s = this.S(client);
      if (!p || !s || p.dead || !Number.isFinite(m?.x) || !Number.isFinite(m?.z)) return;
      const now = Date.now();
      s.budget = Math.min(BURST, s.budget + ((now - s.t) / 1000) * RATE);
      s.t = now;
      let x = clampX(m.x, p.x), z = clamp(m.z);   // não dá para cruzar de região andando: só pelo portal
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
      const now = Date.now();
      if (now - s.lastRecall < 10_000) return;
      s.lastRecall = now;
      const t = TOWNS.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      p.x = t.x; p.z = t.z; s.budget = BURST; s.t = now;
    });

    this.onMessage("portal", (client, m) => {
      const p = this.state.players.get(client.sessionId), s = this.S(client);
      const g = PORTALS[String(m?.id)];
      if (!p || !s || !g || p.dead) return;
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
      const t = TOWNS.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      p.x = t.x; p.z = t.z; s.budget = BURST; s.t = now;
    });

    this.onMessage("chat", (client, m) => {
      const p = this.state.players.get(client.sessionId), s = this.S(client);
      if (!p || !s || typeof m?.text !== "string") return;
      const now = Date.now();
      if (now - s.lastChat < 700) return;
      s.lastChat = now;
      const text = m.text.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200);
      if (!text) return;
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
    if (p.x > 150 && c.level < SOLARA_MIN_LEVEL) { p.x = 0; p.z = 5; }
    this.state.players.set(client.sessionId, p);
    const now = Date.now();
    const s: Sess = { client, acc: a.acc, charId: c.id, c, stash: a.stash, t: now, budget: BURST, lastChat: 0, lastRecall: 0, lastPortal: 0, lastRevive: 0,
      dirty: true, saving: false, d: null, tokens: 30, tokT: now, cd: Array(8).fill(0), lastBasic: 0, buffs: {}, cst: 0, cstAt: 0, lastSkill: -1, lastSkillAt: 0, drops: new Map(), dropSeq: 0 };
    this.sess.set(client.sessionId, s);
    this.sync(s);
    this.broadcast("chat", { kind: "sys", text: `${p.name} entrou no mundo.` }, { except: client });
  }

  async onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId), s = this.sess.get(client.sessionId);
    if (p) this.broadcast("chat", { kind: "sys", text: `${p.name} saiu do mundo.` }, { except: client });
    if (s) { s.saving = false; await this.save(s); }
    this.state.players.delete(client.sessionId);
    this.sess.delete(client.sessionId);
    for (const sim of this.sim.list) sim.contrib.delete(client.sessionId);
  }

  async onDispose() { await this.saveAll(); }
}
