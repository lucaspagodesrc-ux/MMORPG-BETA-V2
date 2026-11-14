import { Room, Client, ServerError } from "colyseus";
import { WorldState, Player } from "./schema";
import { auctionMsg, auctionSweep } from "./auction";
import { mailMsg, mailNotify, mailSweep } from "./mail";
import { tradeMsg, tradeLeave } from "./trade";
import { verifyToken, loadCharacter, loadStash, saveChar, saveStash, AuthUser } from "./auth";
import { MonsterSim, Sim } from "./monsters";
import { Dungeons } from "./dungeon";
import { WorldBosses, wbNow } from "./worldboss";
import { guildMsg, guildAnswer, guildJoin, guildLeave, guildChat, gpAdd, gpFromOut, guildDispose } from "./guild";
import { Pvp } from "./pvp";
const R: any = require("./rules.js");

const MAP = 80;          // mesmo limite do cliente
const RATE = 14;         // unidades/s sustentadas (jogador anda ~6-8)
const BURST = 20;        // folga para habilidades de avanço (ex.: Investida)
const clamp = (v: number) => Math.max(-MAP, Math.min(MAP, v));
// Dentro de uma dungeon em grade o mapa passa de z=80 (o Abismo vai até z≈210); as paredes são validadas por dg.clampMove.
const clampZ = (v: number, inst: number) => (inst ? Math.max(-120, Math.min(240, v)) : clamp(v));
// O mundo tem duas regiões de 160x160: a Vila Aurora (centro x=0) e Solara (centro x=300).
const cx = (x: number) => (x < -150 ? -300 : x > 1650 ? 1800 : x > 450 ? 600 : x > 150 ? 300 : 0);   // 1800 = Arena PK
const DGCX: number[] = R.DUNGEONS.map((d: any) => d.cx);
const clampX = (x: number, ref: number) => {
  if (ref > 1650) return Math.max(1760, Math.min(1840, x));                 // Arena PK (o limite redondo é aplicado no "move")
  if (ref > 450) { const c = DGCX.reduce((a, b) => (Math.abs(b - ref) < Math.abs(a - ref) ? b : a)), w = c === 600 ? 12 : 90; return Math.max(c - w, Math.min(c + w, x)); }   // dungeons: a Cripta é um corredor; as outras têm paredes próprias (grade)
  const c = cx(ref); return Math.max(c - MAP, Math.min(c + MAP, x));
};
const SOLARA_MIN_LEVEL = 50, SNOW_MIN_LEVEL = 75;
const PORTALS: Record<string, { x: number; z: number; to: { x: number; z: number }; minLevel: number }> = {
  portal_a: { x: 14, z: 56, to: { x: 300, z: -7 }, minLevel: SOLARA_MIN_LEVEL },
  portal_b: { x: 300, z: -11, to: { x: 14, z: 52 }, minLevel: 0 },
  portal_c: { x: -32, z: -45, to: { x: -300, z: -7 }, minLevel: SNOW_MIN_LEVEL },
  portal_d: { x: -300, z: -11, to: { x: -32, z: -41 }, minLevel: 0 },
};
const TOWNS = [{ x: 0, z: 5 }, { x: 300, z: 5 }, { x: -300, z: 5 }];   // pontos de renascimento / retorno
const NPC_REACH = 8, PICK_REACH = 7, HIT_SLACK = 4;  // folgas por causa da latência

type Buff = { val: number; until: number };
type Sess = {
  client: Client; acc: AuthUser; charId: string; c: any; stash: any[]; potAt?: number;
  t: number; budget: number; lastChat: number; lastRecall: number; lastPortal: number; lastRevive: number;
  dirty: boolean; saving: boolean; d: any;
  tokens: number; tokT: number;
  cd: number[]; lastBasic: number; buffs: Record<string, Buff>; cst: number; cstAt: number; lastSkill: number; lastSkillAt: number; form?: number; dag?: { id: number; st: string; ret?: () => void };
  seen: Set<number>; busyUntil: number; skUntil?: number;
  partyId: number; ward?: { v: number; until: number }; clone?: { n: number; mult: number; until: number };
  pv?: any; px?: any; noDuel?: boolean; tpAt?: number;      // PvP (duelo / Arena PK): estado, alvo-proxy, "não aceitar duelos", último teleporte
};
type WDrop = { id: number; item: any; x: number; z: number; exp: number; life: number; inst: number; owner: string; party: number; free: number };
type POff = { cid: string; n: string; cls: string; lv: number; since: number };
/* v1.68: quem cai/sai do jogo continua no grupo como OFFLINE por 3 minutos (off); key = identificação que sobrevive à reinicialização do servidor (gravada no personagem) */
type Party = { id: number; key: string; leader: string; members: string[]; off: POff[] };
const PARTY_OFF_MS = 180_000;

export class WorldRoom extends Room<WorldState> {
  maxClients = 100;
  private sess = new Map<string, Sess>();
  private sim!: MonsterSim;
  private dg!: Dungeons;
  private wb!: WorldBosses;
  private pvp!: Pvp;
  private parties = new Map<number, Party>();
  private partySeq = 0;
  private deadParty = new Map<string, number>();   // grupos desfeitos (key → quando), para não serem recriados por quem volta
  private invites = new Map<string, { from: string; until: number }>();
  private wd = new Map<number, WDrop>();            // drops do mundo (visíveis a todos)
  private wdSeq = 0;

  /* ---------- utilidades ---------- */
  private S(client: Client) { return this.sess.get(client.sessionId); }
  private stats(s: Sess) { const g = (s.c.gmu || 0) > Date.now(); if (s.d && !!s.d.gm !== g) s.d = null; return s.d || (s.d = R.stats(s.c)); }
  private touch(s: Sess) { s.d = null; s.dirty = true; }
  private buff(s: Sess, k: string) { const b = s.buffs[k]; return b && b.until > Date.now() ? b.val : 0; }
  /** Égide do Guardião: escudo que absorve dano. Vai para quem lançou e para os membros do grupo por perto (nunca para quem está em duelo). */
  private giveWard(s: Sess, v: number, dur: number, i: number) {
    const p = this.playerOf(s); if (!p) return; const until = Date.now() + dur * 1000;
    for (const [sid, o] of this.sess) {
      if (o !== s && (!s.partyId || o.partyId !== s.partyId)) continue;
      const q = this.state.players.get(sid); if (!q || q.dead) continue;
      if (o !== s && (q.inst !== p.inst || cx(q.x) !== cx(p.x) || Math.hypot(q.x - p.x, q.z - p.z) > 45)) continue;
      if (o.pv && o.pv.mode === "duel") continue;
      o.ward = { v, until }; o.client.send("ward", { v, max: v, dur, by: s.c.name, me: o === s ? 1 : 0, i });
    }
  }
  /** tira o escudo (começo de duelo) */
  clearWard(s: Sess, why = "") { if (s.ward) { s.ward = undefined; s.client.send("ward", { v: 0, why }); } }
  private addBuff(s: Sess, k: string, val: number, dur: number) { s.buffs[k] = { val, until: Date.now() + dur * 1000 }; }
  private okRate(s: Sess, cost = 1) {            // balde de fichas por jogador (contra spam de mensagens)
    const now = Date.now(); s.tokens = Math.min(30, s.tokens + (now - s.tokT) / 1000 * 12); s.tokT = now;
    if (s.tokens < cost) return false; s.tokens -= cost; return true;
  }
  private isPaused(p: any) { const I = p && p.inst ? this.dg.insts.get(p.inst) : undefined; return !!(I && I.paused); }
  private sync(s: Sess) { if (s.c.gm) s.c.gold = R.GM_GOLD; const p = this.state.players.get(s.client.sessionId); if (p) { const ap = R.apOf(s.c); if (p.ap !== ap) p.ap = ap; const tt = s.c.title || ""; if (p.tt !== tt) p.tt = tt; const gb = (s.c.gmu || 0) > Date.now() ? 1 : 0; if (p.gb !== gb) p.gb = gb; const sp = s.c.spec || ""; if (p.sp !== sp) p.sp = sp; } s.client.send("sync", { c: s.c, st: s.stash }); }
  private res(s: Sess, out: any[], ok = true) { gpFromOut(s, out); s.client.send("res", { ok, out }); }
  private addDrop(s: Sess, item: any, x: number, z: number, life: number) {
    const id = ++this.wdSeq, now = Date.now(), p = this.playerOf(s);
    this.wd.set(id, { id, item, x, z, exp: now + (life ? life : 600_000) + 3000, life, inst: p?.inst || 0, owner: s.client.sessionId, party: s.partyId, free: now + 20_000 });
    this.pushDrops();
  }
  private canPick(d: WDrop, s: Sess) { return d.owner === s.client.sessionId || Date.now() >= d.free || (d.party > 0 && s.partyId === d.party); }
  /** Mostra a cada jogador os drops da sua instância/perto dele (e remove os que sumiram). */
  private pushDrops() {
    const now = Date.now();
    for (const s of this.sess.values()) {
      const p = this.playerOf(s); if (!p) continue;
      const vis = new Set<number>();
      for (const d of this.wd.values()) {
        if (d.inst !== (p.inst || 0) || cx(d.x) !== cx(p.x) || Math.hypot(d.x - p.x, d.z - p.z) > 90) continue;
        vis.add(d.id);
        if (!s.seen.has(d.id)) { s.seen.add(d.id); s.client.send("drop", { id: d.id, item: d.item, x: d.x, z: d.z, life: d.life ? Math.max(1000, d.exp - 3000 - now) : 0, lock: this.canPick(d, s) ? 0 : Math.max(0, d.free - now) }); }
      }
      for (const id of [...s.seen]) if (!vis.has(id)) { s.seen.delete(id); s.client.send("drm", { id }); }
    }
  }
  /* ---------- grupos ---------- */
  partyOf(s: Sess): Party | undefined { return s.partyId ? this.parties.get(s.partyId) : undefined; }
  private sendParty(pt: Party) {
    if (!pt.members.includes(pt.leader) && pt.members.length) pt.leader = pt.members[0];
    const members: any[] = pt.members.map((sid) => { const p = this.state.players.get(sid); return p ? { n: p.name, cls: p.cls, lv: p.level, dg: p.inst > 0 ? 1 : 0 } : null; }).filter(Boolean);
    for (const o of pt.off) members.push({ n: o.n, cls: o.cls, lv: o.lv, dg: 0, off: 1, left: Math.max(0, Math.ceil((o.since + PARTY_OFF_MS - Date.now()) / 1000)) });
    const leader = this.state.players.get(pt.leader)?.name || "";
    /* fotografia do grupo gravada em cada membro online: permite remontar o grupo depois que o servidor reinicia */
    const list = [...pt.members.map((sid) => { const x = this.sess.get(sid), p = this.state.players.get(sid); return x && p ? { cid: x.charId, n: p.name, cls: p.cls, lv: p.level } : null; }).filter(Boolean), ...pt.off.map((o) => ({ cid: o.cid, n: o.n, cls: o.cls, lv: o.lv }))];
    const lc = this.sess.get(pt.leader)?.charId || "";
    for (const sid of pt.members) { const x = this.sess.get(sid); if (!x) continue; x.c.pty = { key: pt.key, lc, list }; x.dirty = true; x.client.send("party", { leader, members }); }
  }
  private newPartyKey() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  /* jogador caiu/saiu do jogo: fica no grupo como offline (o grupo continua existindo mesmo que todos estejam offline, até vencer o prazo) */
  private partyOffline(sid: string) {
    const s = this.sess.get(sid); if (!s) return; const pt = this.partyOf(s); s.partyId = 0; if (!pt) return;
    pt.members = pt.members.filter((x) => x !== sid);
    if (pt.members.some((x) => this.sess.get(x)?.charId === s.charId)) { this.sendParty(pt); return; }   // entrou de novo por outra conexão
    const p = this.state.players.get(sid);
    pt.off = pt.off.filter((o) => o.cid !== s.charId);
    pt.off.push({ cid: s.charId, n: p?.name || s.c.name || "Jogador", cls: p?.cls || s.c.cls, lv: p?.level || s.c.level, since: Date.now() });
    for (const m of pt.members) this.sysTo(this.sess.get(m), `${p?.name || "Um membro"} ficou offline. Sai do grupo se não voltar em 3 minutos.`);
    this.sendParty(pt);
  }
  /* a cada 5 s: tira do grupo quem passou 3 minutos offline */
  private partyTick() {
    const now = Date.now();
    for (const [k, t] of this.deadParty) if (now - t > 30 * 60_000) this.deadParty.delete(k);
    for (const pt of [...this.parties.values()]) {
      const gone = pt.off.filter((o) => now - o.since >= PARTY_OFF_MS); if (!gone.length) continue;
      pt.off = pt.off.filter((o) => now - o.since < PARTY_OFF_MS);
      for (const g of gone) for (const m of pt.members) this.sysTo(this.sess.get(m), `${g.n} saiu do grupo (ficou offline por 3 minutos).`);
      if (pt.members.length + pt.off.length < 2 || !pt.members.length && !pt.off.length) {
        for (const m of pt.members) { const o = this.sess.get(m); if (o) { o.partyId = 0; delete o.c.pty; o.dirty = true; o.client.send("party", null); this.sysTo(o, "O grupo foi desfeito."); } }
        this.parties.delete(pt.id); this.deadParty.set(pt.key, now); continue;
      }
      if (pt.members.length) this.sendParty(pt);
    }
  }
  /* quem entra no jogo volta para o grupo em que estava (se voltou dentro de 3 minutos, ou se o servidor reiniciou nesse meio tempo) */
  private partyRejoin(s: Sess) {
    const pk = s.c.pty, sid = s.client.sessionId; if (!pk || !pk.key) return;
    const now = Date.now(), name = this.state.players.get(sid)?.name || s.c.name;
    let pt = [...this.parties.values()].find((x) => x.key === pk.key);
    if (pt) {
      const old = pt.members.find((x) => x !== sid && this.sess.get(x)?.charId === s.charId);   // a conexão antiga ainda não saiu: troca por esta
      if (old) { pt.members = pt.members.filter((x) => x !== old); const o = this.sess.get(old); if (o) o.partyId = 0; }
      else {
        const i = pt.off.findIndex((o) => o.cid === s.charId);
        if (i < 0 || pt.members.length >= 6) { delete s.c.pty; s.dirty = true; return; }
        pt.off.splice(i, 1);
      }
    } else {
      if (this.deadParty.has(pk.key) || now - (s.c.seen || 0) > PARTY_OFF_MS + 60_000 || !Array.isArray(pk.list)) { delete s.c.pty; s.dirty = true; return; }
      const off = pk.list.filter((o: any) => o && o.cid && o.cid !== s.charId).slice(0, 5).map((o: any) => ({ cid: String(o.cid), n: String(o.n || "?"), cls: String(o.cls || ""), lv: +o.lv || 1, since: now }));
      if (!off.length) { delete s.c.pty; s.dirty = true; return; }
      pt = { id: ++this.partySeq, key: pk.key, leader: sid, members: [], off }; this.parties.set(pt.id, pt);
    }
    pt.members.push(sid); s.partyId = pt.id;
    if (pk.lc === s.charId || !this.sess.has(pt.leader)) pt.leader = sid;
    for (const m of pt.members) if (m !== sid) this.sysTo(this.sess.get(m), `${name} voltou e continua no grupo.`);
    this.sendParty(pt);
  }
  private sysTo(s: Sess | undefined, text: string) { s?.client.send("chat", { kind: "sys", text }); }
  private partyLeave(sid: string, note?: string) {
    const s = this.sess.get(sid); if (!s) return; const pt = this.partyOf(s); s.partyId = 0; delete s.c.pty; s.dirty = true;
    s.client.send("party", null);
    if (!pt) return;
    pt.members = pt.members.filter((x) => x !== sid);
    const nm = this.state.players.get(sid)?.name || "Jogador";
    if (pt.members.length + pt.off.length < 2 || !pt.members.length) {
      for (const m of pt.members) { const o = this.sess.get(m); if (o) { o.partyId = 0; delete o.c.pty; o.dirty = true; o.client.send("party", null); this.sysTo(o, "O grupo foi desfeito."); } }
      this.parties.delete(pt.id); this.deadParty.set(pt.key, Date.now()); return;
    }
    if (pt.leader === sid) { pt.leader = pt.members[0]; }
    for (const m of pt.members) this.sysTo(this.sess.get(m), note || `${nm} saiu do grupo.`);
    this.sendParty(pt);
  }
  findByName(name: string) { for (const [sid, s] of this.sess) if (this.state.players.get(sid)?.name.toLowerCase() === String(name).toLowerCase()) return s; return undefined; }

  private playerOf(s: Sess) { return this.state.players.get(s.client.sessionId)!; }

  async save(s: Sess) {
    if (s.saving) return; s.saving = true; s.dirty = false; s.c.seen = Date.now();
    try {
      const p = this.state.players.get(s.client.sessionId);
      if (p) { const h = R.arenaIn(p.x) ? (s.pv?.home || TOWNS[0]) : p; s.c.pos = { x: Math.round(h.x * 100) / 100, z: Math.round(h.z * 100) / 100 }; }   // na Arena PK salva o lugar de onde veio
      await saveChar(s.acc.id, s.c); await saveStash(s.acc.id, s.stash);
    } catch (e) { s.dirty = true; console.error("save", e); } finally { s.saving = false; }
  }
  async saveAll() { await Promise.all([...this.sess.values()].map((s) => this.save(s))); }

  /* ---------- combate ---------- */
  private hit(s: Sess, sim: Sim, mult: number, o: any = {}) {
    if ((sim as any).pv) return this.pvp.hit(s, sim as any, mult, o);      // alvo é um jogador (duelo / Arena PK)
    if (s.pv && s.pv.mode === "duel") return;                               // em duelo: monstros ficam de fora (nem batem, nem apanham)
    if (!sim.m.alive) return;
    const sid = s.client.sessionId, p = this.state.players.get(sid);
    if (!p || p.dead) return;
    if (sim.inst && this.dg.dormant(sim)) return;               // sala ainda trancada
    if (sim.immune) {                                           // escudo do chefe: avisa (no máximo 1x a cada 2 s) e ignora o golpe
      const t = Date.now(); if (t - ((s as any).immAt || 0) > 2000) { (s as any).immAt = t; this.res(s, [{ toast: "🛡️ O chefe está protegido! Destrua os guardiões do escudo." }], false); }
      return;
    }
    const buffs = { dmg: this.buff(s, "dmg"), defdmg: this.buff(s, "defdmg"), crit: this.buff(s, "crit"), combo: this.buff(s, "combo"), flat: this.buff(s, "flat") };
    const r = R.hitDamage(this.stats(s), { mult, basic: o.basic, defMult: o.defMult, exec: o.exec, forceCrit: o.forceCrit, marked: Date.now() < sim.markUntil, buffs }, { def: sim.def * (1 - (o.pierce || 0)), hp: sim.m.hp, maxHp: sim.m.maxHp });
    const hp0 = sim.m.hp;
    const died = this.sim.damage(sid, sim, r.dmg, o.slow || 0);
    this.broadcast("dmg", { id: sim.m.id, d: r.dmg, c: r.crit ? 1 : 0, by: sid });
    this.hitXp(s, sim, Math.min(r.dmg, hp0), o);                // XP a cada golpe (não só ao matar)
    if (died) { this.onKill(sim); return; }
    if (o.stun || o.root || o.lift || o.pull) this.sim.cc(sim, o, p.x, p.z);
    const cl = s.clone;                                         // Pierrot: os clones atacam junto
    if (!o.noClone && cl && cl.until > Date.now()) for (let n = 0; n < cl.n; n++) this.later(110 + n * 80, () => this.hit(s, sim, mult * cl.mult, { noClone: true, basic: o.basic }));
  }
  private hitNear(s: Sess, x: number, z: number, r: number, mult: number, o: any, seen: Set<Sim>) {
    const inst = this.playerOf(s)?.inst || 0;
    for (const sim of this.sim.list) if (!seen.has(sim) && sim.m.alive && sim.inst === inst && cx(sim.m.x) === cx(x) && Math.hypot(sim.m.x - x, sim.m.z - z) <= r + 0.5 * sim.bs) { seen.add(sim); this.hit(s, sim, mult, { ...o, aoe: true }); }
    if (s.pv && s.pv.mode) for (const q of this.pvp.foes(s)) if (!seen.has(q) && Math.hypot(q.m.x - x, q.m.z - z) <= r + 0.5) { seen.add(q); this.hit(s, q, mult, o); }
  }
  private hitLine(s: Sess, x: number, z: number, ux: number, uz: number, len: number, w: number, mult: number, o: any) {
    const inst = this.playerOf(s)?.inst || 0;
    for (const sim of this.sim.list) {
      if (!sim.m.alive || sim.inst !== inst || cx(sim.m.x) !== cx(x)) continue;
      const rx = sim.m.x - x, rz = sim.m.z - z, t = rx * ux + rz * uz, pd = Math.abs(rx * uz - rz * ux);
      if (t >= -0.5 && t <= len && pd <= w / 2 + 0.5 * sim.bs) this.hit(s, sim, mult, { ...o, aoe: true });
    }
    if (s.pv && s.pv.mode) for (const q of this.pvp.foes(s)) {
      const rx = q.m.x - x, rz = q.m.z - z, t = rx * ux + rz * uz, pd = Math.abs(rx * uz - rz * ux);
      if (t >= -0.5 && t <= len && pd <= w / 2 + 0.5) this.hit(s, q, mult, o);
    }
  }
  private hitArea(s: Sess, x: number, z: number, r: number, mult: number, o: any) {
    const inst = this.playerOf(s)?.inst || 0;
    for (const sim of this.sim.list) if (sim.m.alive && sim.inst === inst && cx(sim.m.x) === cx(x) && Math.hypot(sim.m.x - x, sim.m.z - z) <= r + 0.5 * sim.bs) this.hit(s, sim, mult, { ...o, aoe: true });
    if (s.pv && s.pv.mode) for (const q of this.pvp.foes(s)) if (Math.hypot(q.m.x - x, q.m.z - z) <= r + 0.5) this.hit(s, q, mult, o);
  }
  private dot(s: Sess, sim: Sim, dmg: number, slow = 0) {                     // dano contínuo fixo
    if ((sim as any).pv) return this.pvp.dot(s, sim as any, dmg, slow);
    if (s.pv && s.pv.mode === "duel") return;
    if (!sim.m.alive || sim.immune || (sim.inst && this.dg.dormant(sim))) return; const sid = s.client.sessionId;
    const hp0 = sim.m.hp;
    const died = this.sim.damage(sid, sim, dmg, slow);
    this.broadcast("dmg", { id: sim.m.id, d: dmg, c: 0, by: sid });
    this.hitXp(s, sim, Math.min(dmg, hp0), { dot: true });
    if (died) this.onKill(sim);
  }
  /** Habilidades de salto/investida: o caminho não pode atravessar as paredes da dungeon. */
  private dgClamp(p: any, ox: number, oz: number) {
    if (!p.inst) return; const I = this.dg.insts.get(p.inst); if (!I || !I.def.rooms) return;
    const q = this.dg.clampMove(I, ox, oz, p.x, p.z); p.x = q.x; p.z = q.z;
  }
  private later(ms: number, fn: () => void) { setTimeout(() => { try { fn(); } catch (e) { console.error(e); } }, ms); }

  /* ---------- XP por golpe (v1.47) ----------
     Cada golpe rende XP proporcional à fração da vida do monstro que ele tirou (50% do XP do monstro no total);
     os outros 40% vêm ao derrotá-lo. Habilidades em área: +10%. Habilidades dentro de calabouço: +20%. Grupo por perto: +10% por membro (máx. +30%).
     Cada jogador só recebe XP de golpe até 100% da vida do monstro (curar/reiniciar o monstro não rende XP infinito). */
  private partyBonus(s: Sess): number {
    if (!s.partyId) return 0;
    const p = this.playerOf(s); if (!p) return 0;
    let n = 0;
    for (const [sid, o] of this.sess) {
      if (o === s || o.partyId !== s.partyId) continue;
      const q = this.state.players.get(sid); if (!q || q.dead || q.inst !== p.inst || cx(q.x) !== cx(p.x) || Math.hypot(q.x - p.x, q.z - p.z) > 45) continue;
      n++;
    }
    return Math.min(0.3, n * 0.1);
  }
  private hitXp(s: Sess, sim: Sim, real: number, o: any) {
    const T = sim.T; if (T.dummy || T.wb || T.chest || !(real > 0) || !(sim.m.maxHp > 0)) return;
    const sid = s.client.sessionId, xpp = sim.xpp || (sim.xpp = new Map());
    const paid = xpp.get(sid) || 0, frac = Math.min(real / sim.m.maxHp, 1 - paid); if (frac <= 0) return;
    xpp.set(sid, paid + frac);
    let k = 1 + this.partyBonus(s);
    if (o.aoe) k += 0.1;
    if (!o.basic && !o.dot && sim.inst) k += 0.2;
    const x = R.xpFor(T, sim.m.lvl, s.c.level) * 0.5 * frac * k * (sim.lazy ? 0.35 : 1);
    (s as any).xpAcc = ((s as any).xpAcc || 0) + x;
    const now = Date.now(); if (now - ((s as any).xpAt || 0) >= 700) this.flushXp(s);
  }
  private flushXp(s: Sess) {
    const a = s as any, n = Math.floor(a.xpAcc || 0); a.xpAt = Date.now(); if (n < 1) return;
    a.xpAcc -= n;
    const c = s.c, up = R.gainXp(c, n); this.touch(s);
    if (up) { const p = this.state.players.get(s.client.sessionId); if (p) p.level = c.level; this.sync(s); this.res(s, [{ lvl: c.level }]); }
    else s.client.send("xp", { xp: c.xp, n });
  }

  private onKill(sim: Sim) {
    if (sim.T.dummy) return;                                    // espantalho de treino: sem XP, drop ou missão
    if (sim.T.wb) { this.wb.killed(sim); return; }              // chefe de mundo: ranking, prêmios por correio, relíquias
    const T = sim.T, mlvl = sim.m.lvl, mx = sim.m.x, mz = sim.m.z;
    if (T.chest) { this.dg.onKill(sim); return; }          // baú de dungeon: o prêmio é entregue pela instância
    let total = 0; sim.contrib.forEach((v) => (total += v));
    sim.contrib.forEach((dmg, sid) => {
      const s = this.sess.get(sid); if (!s) return;
      const share = total > 0 ? dmg / total : 0;
      if (share < 0.1 && sid !== sim.lastHitBy) return;               // quem só encostou não ganha
      const c = s.c, out: any[] = [];
      this.flushXp(s);                                               // paga o XP de golpe que ainda estava acumulado
      const xp = Math.max(1, Math.round(R.xpFor(T, mlvl, c.level) * 0.4 * Math.min(1, 0.4 + share) * (1 + this.partyBonus(s)) * (sim.lazy ? 0.35 : 1)));   // 40% do XP vem do golpe final   // reforços/ondas da dungeon dão menos XP
      c.kills = (c.kills || 0) + 1;
      out.push({ log: `<span style="color:#ffd27a">${T.n} Nv ${mlvl} derrotado! +${xp} XP</span>` });
      if (R.gainXp(c, xp)) { out.push({ lvl: c.level }); const p = this.state.players.get(sid); if (p) p.level = c.level; }
      out.push(...R.questKill(c, sim.m.type));
      out.push(...R.dwEv(c, "kill", { x: mx, boss: !!T.boss, lvl: mlvl }));          // missões diárias/semanais
      if (!sim.lazy) gpAdd(s, T.boss ? R.GP.boss : R.GP.kill);                          // Pontos de Guilda
      this.touch(s); this.sync(s); this.res(s, out);
      const gf = this.stats(s).gf || 0;                               // bônus de conjunto: mais ouro dos monstros
      if (!sim.lazy || Math.random() < 0.5) for (const it of R.rollLoot(T, mlvl, c.cls, R.luckOf(c, this.buff(s, "luck")))) { if (it.k === "gold" && gf) it.n = Math.round(it.n * (1 + gf)); this.addDrop(s, it, mx, mz, 0); }
      if (!sim.inst) {                                                  // ingresso de dungeon: drop raro (0,3% comum / 4% chefe) — vem a dungeon da região onde o monstro morreu
        const reg = R.regOf(mx), cand = R.DUNGEONS.filter((d: any) => (d.reg || 300) === reg && mlvl >= d.minLevel - 8);
        if (cand.length && Math.random() < (T.boss ? 0.04 : 0.003) * (1 + R.luckOf(c, this.buff(s, "luck")))) this.addDrop(s, { k: "tix", id: cand[Math.floor(Math.random() * cand.length)].id, n: 1 }, mx, mz, 0);
      }
    });
    if (sim.inst) this.dg.onKill(sim);
  }

  private cast(s: Sess, m: any) {
    const p = this.playerOf(s); if (!p || p.dead) return;
    const c = s.c, C = R.CLASSES[c.cls], i = m?.i;
    if (!Number.isInteger(i) || i < 0 || i >= C.skills.length) return;
    const rank = c.sk[i] || 0; if (!rank || c.level < C.skills[i].lv) return;
    if (s.form && Date.now() < s.form) return;                         // Metamorfose: só ataque básico
    if (this.isPaused(p)) return;
    if (c.cls !== "assassino" && Date.now() < s.busyUntil - 220) return;   // uma habilidade só depois do fim da animação da outra
    if (!(C.skills[i].type === "daggerFan" && s.dag && s.dag.st === "stuck") && Date.now() < (s.skUntil || 0) - 250) return;   // vale para todas as classes: tempo de exibição da habilidade anterior (R.castMs)
    const sk = R.skStat(c.cls, i, rank), now = Date.now();
    if (C.skills[i].type === "daggerFan" && s.dag && s.dag.st === "stuck" && s.dag.ret) {      // chamar as adagas de volta
      s.dag.ret();
      this.broadcast("fx", { by: s.client.sessionId, i, rc: 1, x: p.x, z: p.z }, { except: s.client });
      return;
    }
    if (now < s.cd[i] - 300) return;                                   // recarga (com folga de latência)
    if (sk.ally && m?.pid) {                                            // Muralha de Ferro em outro jogador (recarga maior)
      const ts = this.sess.get(String(m.pid)), q = ts && this.state.players.get(String(m.pid));
      if (!ts || !q || q.dead || q.inst !== p.inst || cx(q.x) !== cx(p.x) || Math.hypot(q.x - p.x, q.z - p.z) > 16) return;
      if ((s.pv && s.pv.mode) || (ts.pv && ts.pv.mode)) { if (s.pv?.mode === "duel" || ts.pv?.mode === "duel" || !s.partyId || s.partyId !== ts.partyId) return; }   // em PvP só o grupo recebe apoio (e nunca em duelo)
      s.cd[i] = now + sk.cdAlly * 1000;
      for (const k in sk.buffs) this.addBuff(ts, k, sk.buffs[k], sk.dur);
      ts.client.send("abuff", { i, cls: s.c.cls, by: s.c.name, buffs: sk.buffs, dur: sk.dur });
      this.broadcast("fx", { by: s.client.sessionId, i, pid: String(m.pid), x: p.x, z: p.z }, { except: s.client });
      return;
    }
    const off = !["buff", "dashBack", "heal", "clone", "transform"].includes(sk.type);
    if (off && R.inTown(p.x, p.z)) return;
    if ((sk as any).ward && s.pv && s.pv.mode === "duel") return;       // Égide: não funciona em duelo
    let tgt: Sim | undefined;
    if (["single", "dash", "aoeTarget", "multi", "barrage", "mark", "chainPull", "thunder", "arcRay"].includes(sk.type)) {
      tgt = (s.pv && s.pv.mode && m?.pid) ? (this.pvp.target(s, String(m.pid)) as any) : this.sim.byId.get(Number(m?.tid));      // alvo: monstro ou, em duelo / Arena, outro jogador
      if (!tgt || !tgt.m.alive || tgt.inst !== p.inst || cx(tgt.m.x) !== cx(p.x) || Math.hypot(tgt.m.x - p.x, tgt.m.z - p.z) > sk.range + HIT_SLACK) return;
    }
    s.cd[i] = now + sk.cd * 1000; s.busyUntil = now + R.animMs(c.cls, i); s.skUntil = now + R.castMs(c.cls, i);
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
    if (sk.type === "transform") s.form = now + sk.dur * 1000;
    let star: Sim[] = [];
    if (sk.type === "starJump" || sk.type === "chainPull") {
      const chain = sk.type === "chainPull", lim = chain ? sk.radius + 2 : sk.range + 6, mx = chain ? sk.cnt : sk.jumps;
      const ox = chain && tgt ? tgt.m.x : p.x, oz = chain && tgt ? tgt.m.z : p.z;
      const ids: any[] = Array.isArray(m?.tids) ? m.tids.slice(0, mx) : [];
      for (const id of ids) { const q = this.sim.byId.get(Number(id)); if (q && q.m.alive && !star.includes(q) && q.inst === p.inst && cx(q.m.x) === cx(p.x) && Math.hypot(q.m.x - ox, q.m.z - oz) <= lim) star.push(q); }
      if (chain && tgt) { const k = star.indexOf(tgt); if (k > 0) star.splice(k, 1); if (k !== 0) star.unshift(tgt); star = star.slice(0, mx); }
      if (!star.length && s.pv && s.pv.mode && m?.pid) { const q = this.pvp.target(s, String(m.pid)) as any; if (q && Math.hypot(q.m.x - ox, q.m.z - oz) <= lim) star.push(q); }
      if (!star.length) { s.cd[i] = 0; return; }
    }
    let ux = 0, uz = 1;                    // direção da habilidade (Escudo Voador / Raio do Escudo)
    if (Number.isFinite(m?.dx) && Number.isFinite(m?.dz)) { const dl = Math.hypot(m.dx, m.dz); if (dl > 0.01) { ux = m.dx / dl; uz = m.dz / dl; } }
    const pq: any = tgt && (tgt as any).pv ? tgt : star.find((q: any) => q.pv);          // alvo jogador (PvP)
    this.broadcast("fx", { by: s.client.sessionId, i, tid: tgt && !(tgt as any).pv ? tgt.m.id : 0, ptid: pq ? pq.sid : undefined, x: p.x, z: p.z, dx: ux, dz: uz, n: sk.dag || 0, tids: star.filter((q: any) => !q.pv).map((q) => q.m.id) }, { except: s.client });
    const pr = sk.proj || (C.ranged ? C.proj : null), so = { slow: sk.slow, defMult: sk.defMult, exec: sk.exec, stun: sk.stun, root: sk.root, lift: sk.lift, pull: sk.pull, forceCrit: sk.forceCrit, pierce: sk.pierce };
    const flight = tgt ? Math.max(0.2, Math.hypot(tgt.m.x - p.x, tgt.m.z - p.z)) / 24 * 1000 : 0;
    const px = p.x, pz = p.z;
    switch (sk.type) {
      case "single": this.later((pr ? flight : 150) + (sk.pre || 0), () => tgt && this.hit(s, tgt, mult, so)); break;
      case "multi": for (let h = 0; h < sk.hits; h++) this.later(h * (sk.fan ? 60 : 190) + (pr ? flight : 0), () => tgt && this.hit(s, tgt, mult)); break;
      case "aoeSelf": this.later(sk.delay || 200, () => { const q = this.playerOf(s); this.hitArea(s, sk.delay && q ? q.x : px, sk.delay && q ? q.z : pz, sk.radius, mult, so); }); break;
      case "shieldThrow": {                 // escudo voa (perfura), gira 2s no alcance máximo (área) e volta
        const SPD = (sk as any).fspd || 16, SPIN = ((sk as any).spin || 2) * 1000, NT = Math.max(1, Math.floor(SPIN / 400)), tOut = (sk.range / SPD) * 1000, sx = p.x, sz = p.z, ex = sx + ux * sk.range, ez = sz + uz * sk.range;
        const seen1 = new Set<Sim>(), seen2 = new Set<Sim>();
        for (let t = 0; t <= tOut; t += 100) this.later(300 + t, () => { const f = t / tOut; this.hitNear(s, sx + (ex - sx) * f, sz + (ez - sz) * f, 1.8, mult, so, seen1); });
        for (let k = 1; k <= NT; k++) this.later(300 + tOut + k * 400, () => this.hitArea(s, ex, ez, 3.4, mult * 0.45 * 5 / NT, so));   // mesmo dano total do giro antigo (5 pulsos), em menos tempo
        for (let t = 0; t <= tOut; t += 100) this.later(300 + tOut + SPIN + t, () => { const q = this.playerOf(s); if (!q) return; const f = t / tOut; this.hitNear(s, ex + (q.x - ex) * f, ez + (q.z - ez) * f, 1.8, mult, so, seen2); });
        break;
      }
      case "shieldBeam": {                  // raio fixo na direção do golpe por 3s (perfurante)
        { const NB = Math.max(1, Math.round(((sk as any).beam || 3) * 1000 / 300)); for (let k = 0; k < NB; k++) this.later(350 + k * 300, () => { const q = this.playerOf(s); if (q && !q.dead) this.hitLine(s, q.x, q.z, ux, uz, sk.range, 1.5, mult * 10 / NB, so); }); }   // mesmo dano total do raio antigo (10 pulsos), em menos tempo
        break;
      }
      case "aoeMulti": for (let h = 0; h < sk.hits; h++) this.later(200 + h * 200, () => this.hitArea(s, p.x, p.z, sk.radius, mult, so)); break;
      case "taunt": {
        for (const k in sk.buffs) this.addBuff(s, k, sk.buffs[k], sk.dur);
        for (const sim of this.sim.list) if (sim.m.alive && sim.inst === p.inst && cx(sim.m.x) === cx(p.x) && Math.hypot(sim.m.x - px, sim.m.z - pz) <= sk.radius) this.sim.taunt(sim, s.client.sessionId, sk.dur * 1000);
        break;
      }
      case "clone": s.clone = { n: sk.clones, mult: sk.cloneMult, until: now + sk.dur * 1000 }; this.broadcast("clones", { by: s.client.sessionId, n: sk.clones, dur: sk.dur }); break;
      case "aoeTarget": { const tx = tgt!.m.x, tz = tgt!.m.z; if (sk.balls) { for (let k = 0; k < sk.balls; k++) this.later(600 + k * sk.gap, () => this.hitArea(s, tx, tz, sk.radius, mult / sk.balls, so)); break; }
        this.later(sk.meteor ? 600 : 650, () => this.hitArea(s, tx, tz, sk.radius, mult, so)); break; }
      case "barrage": case "dash": {
        const dx = tgt!.m.x - p.x, dz = tgt!.m.z - p.z, d = Math.hypot(dx, dz) || 1, mv = Math.max(0, d - (sk.type === "dash" ? 1.7 : 1.6));
        { const ox = p.x, oz = p.z; p.x = clampX(p.x + (dx / d) * mv, p.x); p.z = clampZ(p.z + (dz / d) * mv, p.inst); this.dgClamp(p, ox, oz); } s.t = now;
        if (sk.type === "dash") this.later(120, () => this.hit(s, tgt!, mult, so));
        else {
          for (let h = 0; h < sk.hits; h++) this.later(150 + h * 130, () => this.hit(s, tgt!, mult));
          this.later(200 + sk.hits * 130, () => { for (let j = 0; j < 8; j++) if (j !== i) s.cd[j] = 0; });
        }
        break;
      }
      case "chainPull": {                  // prende até 5 monstros e junta todos no centro
        const grp = star.length ? star : [tgt!];
        let cx0 = 0, cz0 = 0; for (const q of grp) { cx0 += q.m.x; cz0 += q.m.z; } cx0 /= grp.length; cz0 /= grp.length;
        const ring = grp.length > 1 ? 0.9 : 0, st0 = grp.map((q) => ({ x: q.m.x, z: q.m.z }));
        grp.forEach((q) => { if (!(q as any).pv) this.sim.cc(q, { stun: 900 }, p.x, p.z); });
        grp.forEach((q, n) => {
          const a = (n / grp.length) * 6.283, ex = cx0 + Math.cos(a) * ring, ez = cz0 + Math.sin(a) * ring;
          for (let k = 1; k <= 6; k++) this.later(250 + k * 70, () => { if (!q.m.alive || q.boss) return; const f = k / 6; q.m.x = st0[n].x + (ex - st0[n].x) * f; q.m.z = st0[n].z + (ez - st0[n].z) * f; });
          this.later(250 + 6 * 70 + 40, () => this.hit(s, q, mult, so));
        });
        break;
      }
      case "roll": {                       // Sentença do Colosso: rolamento de 4s; o cliente cuida de ricochetear em obstáculos
        const last = new Map<Sim, number>(), dur = sk.dur * 1000;
        for (let t = 150; t <= dur; t += 150) this.later(t, () => {
          const q = this.playerOf(s); if (!q || q.dead) return; const tn = Date.now();
          for (const sim of this.sim.list) if (sim.m.alive && sim.inst === q.inst && cx(sim.m.x) === cx(q.x) && Math.hypot(sim.m.x - q.x, sim.m.z - q.z) <= sk.radius + 0.5 * sim.bs && tn - (last.get(sim) || 0) > 650) { last.set(sim, tn); this.hit(s, sim, mult, so); }
          if (s.pv && s.pv.mode) for (const q2 of this.pvp.foes(s)) if (Math.hypot(q2.m.x - q.x, q2.m.z - q.z) <= sk.radius + 0.5 && tn - (last.get(q2) || 0) > 650) { last.set(q2, tn); this.hit(s, q2, mult, so); }
        });
        break;
      }
      case "thunder": case "arcRay": {                    // Trovão: raio em área + dano contínuo (240/s por 8s)
        const tx0 = tgt!.m.x, tz0 = tgt!.m.z, sid = s.client.sessionId;
        this.later(sk.type === "thunder" ? 700 : 350, () => {
          const cx0 = tgt!.m.alive ? tgt!.m.x : tx0, cz0 = tgt!.m.alive ? tgt!.m.z : tz0, hit: Sim[] = [], inst = tgt!.inst;
          for (const sim of this.sim.list) if (sim.m.alive && sim.inst === inst && cx(sim.m.x) === cx(cx0) && Math.hypot(sim.m.x - cx0, sim.m.z - cz0) <= sk.radius + 0.5 * sim.bs) hit.push(sim);
          if (s.pv && s.pv.mode) for (const q of this.pvp.foes(s)) if (Math.hypot(q.m.x - cx0, q.m.z - cz0) <= sk.radius + 0.5) hit.push(q);
          hit.forEach((sim) => this.hit(s, sim, mult, so));
          for (let k = 1; k <= sk.dotDur; k++) this.later(k * 1000, () => { if (!this.sess.has(sid)) return; for (const q of hit) this.dot(s, q, sk.dot, sk.slow || 0); });
        });
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
          { const ox = pp.x, oz = pp.z; pp.x = clampX(pp.x + (dx / d) * mv, pp.x); pp.z = clampZ(pp.z + (dz / d) * mv, pp.inst); this.dgClamp(pp, ox, oz); } s.t = Date.now();
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
      case "stab3": {                      // Golpe Poderoso: 3 estocadas para a frente
        for (let n = 0; n < 3; n++) this.later(120 + n * 180, () => { const q = this.playerOf(s); if (!q || q.dead) return; this.hitLine(s, q.x, q.z, ux, uz, sk.range, 1.8, mult, so); });
        break;
      }
      case "dashBack": case "buff": case "transform": case "heal": for (const k in sk.buffs) this.addBuff(s, k, sk.buffs[k], sk.dur);
        if ((sk as any).ward) this.giveWard(s, (sk as any).ward, sk.dur, i); if (sk.type === "heal") this.pvp.onHealSkill(s, sk); break;
    }
  }

  private basic(s: Sess, m: any) {
    const p = this.playerOf(s); if (!p || p.dead || R.inTown(p.x, p.z)) return;
    const C = R.CLASSES[s.c.cls], now = Date.now(), d = this.stats(s);
    if (this.isPaused(p)) return;
    if (s.c.cls !== "assassino" && now < s.busyUntil - 220) return;
    if (now - s.lastBasic < (900 / (d.atkSpd * (1 + this.buff(s, "aspd")))) * 0.7) return;
    const tgt: Sim | undefined = (s.pv && s.pv.mode && m?.pid) ? (this.pvp.target(s, String(m.pid)) as any) : this.sim.byId.get(Number(m?.tid));
    if (!tgt || !tgt.m.alive || tgt.inst !== p.inst || cx(tgt.m.x) !== cx(p.x) || Math.hypot(tgt.m.x - p.x, tgt.m.z - p.z) > C.range + HIT_SLACK) return;
    s.lastBasic = now; s.busyUntil = now + 260;
    const isP = !!(tgt as any).pv;
    this.broadcast("matk", { by: s.client.sessionId, tid: isP ? 0 : tgt.m.id, ptid: isP ? (tgt as any).sid : undefined }, { except: s.client });
    const flight = Math.max(0.2, Math.hypot(tgt.m.x - p.x, tgt.m.z - p.z)) / 24 * 1000;
    this.later(C.ranged ? flight : 130, () => this.hit(s, tgt, s.c.cls === "tanque" ? 1.15 : 1, { basic: true }));   // Tanque: ataque básico +15% (o Amp. de gemas só vale para habilidades)
  }

  /* ---------- mensagens ---------- */
  private maintT?: NodeJS.Timeout;
  onCreate() {
    this.setState(new WorldState());
    // a cada minuto: anúncios vencidos do leilão voltam por correio; limpa cartas velhas
    this.maintT = setInterval(() => { auctionSweep(this); mailSweep(); }, 60_000); auctionSweep(this);
    this.setPatchRate(50);
    this.sim = new MonsterSim(this.state, {
      hit: (sid, dmg, mid) => this.sess.get(sid)?.client.send("mhit", { raw: dmg, id: mid }),
      attack: (mid) => this.broadcast("mat", { id: mid }),
      slam: (x, z, r, inst, t, c) => this.broadcast("slam", { x, z, r, inst, t, c }),
      wbHit: (sid, s, real) => this.wb && this.wb.hurt(sid, s, real),
      grid: (inst) => this.dg.gridStage(inst),
      walk: (inst, x, z, mg) => this.dg.walk(inst, x, z, mg),
    });
    this.dg = new Dungeons(this);
    this.wb = new WorldBosses(this);
    this.pvp = new Pvp(this);
    let last = Date.now(), sweepAt = 0, saveAt = 0, dgAt = 0, gmAt = 0, wbAt = 0, ptAt = 0;
    this.setSimulationInterval(() => {
      const now = Date.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
      if (this.clients.length) this.sim.update(dt);
      if (now > sweepAt) {
        sweepAt = now + 2000;
        let ch = false;
        for (const [id, d] of this.wd) if (now > d.exp || (d.inst && !this.dg.insts.has(d.inst))) { this.wd.delete(id); ch = true; }
        if (ch || this.sess.size) this.pushDrops();
      }
      if (now > gmAt) { gmAt = now + 1000; for (const s of this.sess.values()) if (s.c.gmu && s.c.gmu <= now) { s.c.gmu = 0; this.touch(s); this.sync(s); s.client.send("gmb", { on: 0 }); } }
      if (now > dgAt) { dgAt = now + 1000; this.dg.tick(now); }
      if (now > wbAt) { wbAt = now + 1000; if (this.clients.length) this.wb.tick(wbNow()); }
      if (this.sess.size) this.pvp.tick();
      if (now > saveAt) { saveAt = now + 12_000; for (const s of this.sess.values()) { if (s.partyId && now - (s.c.seen || 0) > 60_000) s.dirty = true; if (s.dirty) this.save(s); } }
      if (now > ptAt) { ptAt = now + 5000; this.partyTick(); }
    }, 50);

    this.onMessage("move", (client, m) => {
      const p = this.state.players.get(client.sessionId), s = this.S(client);
      if (!p || !s || p.dead || !Number.isFinite(m?.x) || !Number.isFinite(m?.z)) return;
      const now = Date.now();
      if (s.tpAt && now - s.tpAt < 450) return;                  // mensagens de movimento ainda do lugar antigo (depois de um teleporte)
      s.budget = Math.min(BURST, s.budget + ((now - s.t) / 1000) * RATE);
      s.t = now;
      let x = clampX(m.x, p.x), z = clampZ(m.z, p.inst);   // não dá para cruzar de região andando: só pelo portal
      if (p.inst) {
        const I = this.dg.insts.get(p.inst);
        if (I && I.def.rooms) { const q = this.dg.clampMove(I, p.x, p.z, x, z); if (Math.hypot(q.x - x, q.z - z) > 1.2) client.send("correct", { x: q.x, z: q.z }); x = q.x; z = q.z; }   // paredes e portões das salas
        else if (I) z = Math.min(z, this.dg.maxZ(I) - 0.5);                                                                                                                    // portões da cripta
      }
      if (p.x > 1650) { const A = R.ARENA, ax = x - A.x, az = z - A.z, ad = Math.hypot(ax, az), lim = A.r - 0.8; if (ad > lim) { x = A.x + (ax / ad) * lim; z = A.z + (az / ad) * lim; client.send("correct", { x, z }); } }   // Arena PK: arena redonda
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
      const pvm = !!(s.pv && s.pv.mode);
      const r = R.act(s, m, { near, now: Date.now(), potCd: pvm ? R.PVP.potCd : 0 });
      if (pvm && m.t === "pot" && r.ok) this.pvp.onPotion(s, String(m.kind));
      for (const sp of r.spawn) this.addDrop(s, sp.item, p.x, p.z, sp.life);
      p.level = s.c.level; this.touch(s);
      this.sync(s); this.res(s, r.out, r.ok);
    });
    this.onMessage("ah", (client, m) => { const s = this.S(client); if (s && m && typeof m.op === "string" && this.okRate(s, 2)) auctionMsg(this, s, m); });
    this.onMessage("mail", (client, m) => { const s = this.S(client); if (s && m && typeof m.op === "string" && this.okRate(s, 2)) mailMsg(this, s, m); });
    this.onMessage("g", (client, m) => { const s = this.S(client); if (s && m && typeof m.op === "string" && this.okRate(s, 2)) guildMsg(this, s, m); });
    this.onMessage("gans", (client, m) => { const s = this.S(client); if (s && this.okRate(s, 1)) guildAnswer(this, s, m); });
    this.onMessage("dreq", (client, m) => { const s = this.S(client); if (s && m && this.okRate(s, 2)) this.pvp.request(s, m); });          // desafiar para um duelo
    this.onMessage("dans", (client, m) => { const s = this.S(client); if (s && this.okRate(s, 1)) this.pvp.answer(s, m); });             // aceitar / recusar
    this.onMessage("dsurr", (client) => { const s = this.S(client); if (s && this.okRate(s, 1)) this.pvp.surrender(s); });              // desistir do duelo
    this.onMessage("pdown", (client) => { const s = this.S(client); if (s && this.okRate(s, 1)) this.pvp.down(s); });                   // "minha vida acabou" (PvP)
    this.onMessage("arena", (client, m) => { const s = this.S(client); if (s && m && typeof m.op === "string" && this.okRate(s, 2)) this.pvp.arenaMsg(s, m); });
    this.onMessage("tr", (client, m) => { const s = this.S(client); if (s && m && typeof m.op === "string" && this.okRate(s, 1)) tradeMsg(this, s, m); });
    this.onMessage("cast", (client, m) => { const s = this.S(client); if (s && this.okRate(s, 0.5)) this.cast(s, m); });
    this.onMessage("atk", (client, m) => { const s = this.S(client); if (s && this.okRate(s, 0.5)) this.basic(s, m); });
    this.onMessage("pick", (client, m) => {
      const s = this.S(client), p = this.state.players.get(client.sessionId);
      if (!s || !p || p.dead || !this.okRate(s, 1)) return;
      if (this.isPaused(p)) return;
      const d = this.wd.get(Number(m?.id)); if (!d || d.inst !== (p.inst || 0) || cx(d.x) !== cx(p.x)) return;
      if (Math.hypot(d.x - p.x, d.z - p.z) > PICK_REACH) return;
      if (!this.canPick(d, s)) return this.res(s, [{ toast: `🔒 Item de outro jogador — libera em ${Math.ceil((d.free - Date.now()) / 1000)}s` }], false);
      const c = s.c, it = d.item, id = Number(m.id);
      let out: any[];
      if (it.k === "tix") {
        c.tix = c.tix || {};
        if ((c.tix[it.id] || 0) >= 5) return this.res(s, [{ toast: "Você já tem 5 ingressos." }], false);
        c.tix[it.id] = (c.tix[it.id] || 0) + 1;
        out = [{ sfx: "rare" }, { log: `🎟️ Você obteve <b style="color:#ffd24a">${R.nm(it)}</b>!` }];
      } else if (it.k === "gold") { c.gold += it.n; out = [{ sfx: "coin" }, { float: { t: "+" + it.n + " 💰", c: "#ffe28a" } }]; }
      else {
        if (!R.canAdd(c.inv, it)) return this.res(s, [{ toast: "Mochila cheia!" }], false);
        const label = R.nm(it) + (it.n > 1 ? " ×" + it.n : "");
        R.addItem(c.inv, it);
        out = [{ sfx: "pickup" }, { log: `Você obteve <b style="color:${it.k === "eq" ? R.RAR[it.rar].c : "#fff"}">${label}</b>` }];
      }
      this.wd.delete(id); this.pushDrops();
      this.touch(s); this.sync(s); this.res(s, out);
    });

    this.onMessage("died", (client) => {
      const s = this.S(client), p = this.state.players.get(client.sessionId);
      if (!s || !p || p.dead) return;
      p.dead = true;
      if (s.pv && s.pv.mode) { this.pvp.onDied(s); return; }      // PvP: sem penalidade de morte
      const r = R.act(s, { t: "died" }, { now: Date.now() });
      this.touch(s); this.sync(s); this.res(s, r.out);
    });

    this.onMessage("recall", (client) => {       // teleporte para a cidade mais próxima (sem aceitar coordenadas do cliente)
      const p = this.state.players.get(client.sessionId), s = this.S(client);
      if (!p || !s || p.dead) return;
      if (s.pv && s.pv.mode) { this.sysTo(s, "O retorno não funciona durante um duelo ou na Arena PK."); return; }
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
      if (!p || !s || !g || p.dead || p.inst || (s.pv && s.pv.mode)) return;
      const now = Date.now();
      if (now - s.lastPortal < 1500) return;
      if (Math.hypot(p.x - g.x, p.z - g.z) > 9) return;
      if (s.c.level < g.minLevel) { client.send("chat", { kind: "sys", text: `O portal só abre a partir do nível ${g.minLevel}.` }); return; }
      s.lastPortal = now;
      p.x = g.to.x; p.z = g.to.z; s.budget = BURST; s.t = now;
    });

    this.onMessage("revive", (client) => {
      const p = this.state.players.get(client.sessionId), s = this.S(client);
      if (!p || !s || (s.pv && s.pv.mode === "arena")) return;            // na Arena o servidor reaparece o jogador sozinho
      const now = Date.now();
      if (now - s.lastRevive < 3_000) return;
      s.lastRevive = now; p.dead = false;
      if (p.inst) { const I = this.dg.insts.get(p.inst); if (I) { const st = this.dg.startOf(I.def); p.x = st.x; p.z = st.z; s.budget = BURST; s.t = now; return; } }
      const t = TOWNS.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      p.x = t.x; p.z = t.z; s.budget = BURST; s.t = now;
    });

    /* ---- dungeon ---- */
    this.onMessage("dgenter", (client, m) => {
      const s = this.S(client); if (!s || !this.okRate(s, 2)) return;
      const p = this.playerOf(s); if (!p || p.dead) return;
      if (s.pv && s.pv.mode) return void this.res(s, [{ toast: "Termine o duelo (ou saia da Arena PK) antes de entrar em um calabouço." }], false);
      const err = this.dg.enter(s, String(m?.id));
      if (err) this.res(s, [{ toast: err }], false); else { this.touch(s); this.sync(s); const pt = this.partyOf(s); if (pt) this.sendParty(pt); }
    });
    this.onMessage("dgexit", (client, m) => {
      const s = this.S(client), p = this.state.players.get(client.sessionId); if (!s || !p || !p.inst) return;
      const I = this.dg.insts.get(p.inst);
      const ports = I ? R.dgPorts(I.def) : null;
      const atEnd = !!(I && ports && I.done && Math.hypot(p.x - ports.b.x, p.z - ports.b.z) <= 14);
      if (!m?.btn && I && ports && Math.hypot(p.x - ports.a.x, p.z - ports.a.z) > 14 && !atEnd) { this.res(s, [{ toast: I.done ? "Vá até o portal de saída, no fim da dungeon." : "Vá até o portal de saída, no começo da dungeon." }], false); return; }
      this.dg.leave(s, true, atEnd); this.touch(s); this.sync(s);
      this.res(s, [{ log: atEnd ? '<span style="color:#9fe7b0">🏆 Você concluiu a dungeon e saiu pelo portal.</span>' : '<span style="color:#9fe7b0">🚪 Você saiu da dungeon. Seu ingresso continua válido por <b>3 minutos</b> — volte pelo portal da dungeon para continuar (em grupo, enquanto alguém ainda estiver lá dentro).</span>' }]);
      const pt = this.partyOf(s); if (pt) this.sendParty(pt);
    });
    this.onMessage("dgpause", (client, m) => {
      const s = this.S(client); if (!s || !this.okRate(s, 2)) return;
      const err = this.dg.pause(s, !!m?.on); if (err) this.res(s, [{ toast: err }], false);
    });
    this.onMessage("dgtalk", (client, m) => { const s = this.S(client); if (s && this.okRate(s, 1)) this.dg.talk(s, String(m?.id)); });

    /* ---- grupos ---- */
    // Buff do GM: só personagens de conta GM. Modos: self | id (jogador clicado) | near (raio) | all (todos do mapa)
    this.onMessage("ward", (client, m) => { const s = this.sess.get(client.sessionId); if (!s || !s.ward) return; const v = Number(m?.v); if (Number.isFinite(v)) s.ward.v = Math.max(0, Math.min(s.ward.v, v)); });   // o cliente avisa quanto sobrou depois de dano de monstros
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
      if (!p || !s || !s.c.gm || p.inst || R.arenaIn(p.x) || !Number.isFinite(m?.x) || !Number.isFinite(m?.z)) return;
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
      if (pt && pt.members.length + pt.off.length >= 6) return this.sysTo(s, "O grupo está cheio (6 jogadores).");
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
      if (!pt) { pt = { id: ++this.partySeq, key: this.newPartyKey(), leader: iv.from, members: [iv.from], off: [] }; this.parties.set(pt.id, pt); f.partyId = pt.id; }
      if (pt.members.length + pt.off.length >= 6) return this.sysTo(s, "O grupo está cheio.");
      pt.members.push(client.sessionId); s.partyId = pt.id;
      const nm = this.state.players.get(client.sessionId)?.name;
      for (const sid of pt.members) this.sysTo(this.sess.get(sid), `${nm} entrou no grupo.`);
      this.sendParty(pt);
    });
    this.onMessage("pleave", (client) => this.partyLeave(client.sessionId));
    this.onMessage("pkick", (client, m) => {
      const s = this.S(client); const pt = s && this.partyOf(s); if (!s || !pt || pt.leader !== client.sessionId) return;
      const nm = String(m?.name || ""), oi = pt.off.findIndex((o) => o.n.toLowerCase() === nm.toLowerCase());
      if (oi >= 0) { const o = pt.off.splice(oi, 1)[0]; for (const x of pt.members) this.sysTo(this.sess.get(x), `${o.n} foi removido do grupo.`); if (pt.members.length + pt.off.length < 2) { this.partyLeave(client.sessionId, ""); return; } this.sendParty(pt); return; }
      const t = this.findByName(nm); if (!t || t === s || t.partyId !== pt.id) return;
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
      const gb = /^\/chefe(?:\s+(\S+))?$/i.exec(text);                // GM: invoca um chefe de mundo na hora (teste/evento)
      if (gb) {
        if (!s.c.gm) return;
        const key: Record<string, string> = { aurora: "wb_a", gosma: "wb_a", solara: "wb_s", escorpiao: "wb_s", nevasca: "wb_n", wendigo: "wb_n" };
        const id = key[String(gb[1] || "").toLowerCase()];
        if (!id) return client.send("chat", { kind: "sys", text: "Use: /chefe aurora | solara | nevasca" });
        if (!this.wb.force(id)) client.send("chat", { kind: "sys", text: "Esse chefe já está em luta." });
        return;
      }
      if (this.pvp.chat(s, text)) return;                               // /duelo on|off, /desistir
      if (guildChat(s, text)) return;                                  // /g, /gl ou /guilda: chat da guilda
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
    if (!c.name) throw new ServerError(403, "Escolha um nome para este personagem antes de entrar.");
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
    if (pos.x > 1650) { pos.x = 0; pos.z = 5; }                 // caiu dentro da Arena PK (queda do servidor etc.): volta para Aurora
    p.x = clampX(pos.x, pos.x); p.z = clampZ(pos.z, pos.x > 450 ? 1 : 0);
    if (p.x > 150 && p.x < 450 && c.level < SOLARA_MIN_LEVEL) { p.x = 0; p.z = 5; }
    if (p.x < -150 && c.level < SNOW_MIN_LEVEL) { p.x = 0; p.z = 5; }
    this.state.players.set(client.sessionId, p);
    const now = Date.now();
    const s: Sess = { client, acc: a.acc, charId: c.id, c, stash: a.stash, t: now, budget: BURST, lastChat: 0, lastRecall: 0, lastPortal: 0, lastRevive: 0,
      dirty: true, saving: false, d: null, tokens: 30, tokT: now, cd: Array(9).fill(0), lastBasic: 0, buffs: {}, cst: 0, cstAt: 0, lastSkill: -1, lastSkillAt: 0, seen: new Set(), busyUntil: 0, partyId: 0 };
    this.sess.set(client.sessionId, s);
    mailNotify(this, s.acc.id);
    if (p.x > 450) {                                            // estava numa dungeon: volta para a instância se ainda estiver no prazo
      const I = c.run ? this.dg.insts.get(c.run.inst) : undefined;
      if (I && !I.closed && !I.paused && (!c.run.until || Date.now() < c.run.until || (I.grp && I.members.size > 0))) {
        I.members.add(client.sessionId); I.emptySince = 0; delete c.run.until; p.inst = I.id; this.dg.place(I, p);
        client.send("dgenter", { id: I.def.id, inst: I.id, cx: I.def.cx, x: p.x, z: p.z }); this.dg.sendState(I, client.sessionId);
      } else { const e = this.dg.entryOf(R.DUNGEONS.find((d: any) => c.run && d.id === c.run.id) || R.DUNGEONS[0]); p.x = e.x; p.z = e.z; delete c.run; client.send("dgleave", { reason: "A dungeon se fechou enquanto você estava fora.", x: e.x, z: e.z }); }
    } else if (c.run) {                                         // fora da dungeon: mantém o direito de voltar enquanto valer
      const I = this.dg.insts.get(c.run.inst);
      if (!(I && !I.closed && (!c.run.until || Date.now() < c.run.until || (I.grp && I.members.size > 0)))) {
        if (!I && (!c.run.until || Date.now() < c.run.until) && c.run.ends && Date.now() < c.run.ends) { c.tix = c.tix || {}; c.tix[c.run.id] = Math.min(5, (c.tix[c.run.id] || 0) + 1); }
        delete c.run;
      }
    }
    R.dwSync(c);                                                // missões diárias/semanais do período atual
    this.sync(s);
    guildJoin(this, s);                                         // guilda: carrega e avisa
    this.partyRejoin(s);                                        // v1.68: volta para o grupo em que estava
    this.pvp.claim(s).catch(() => {});                          // prêmio do ranking da Arena da semana passada (uma vez)
    client.send("wbs", this.wb.snapshot());                     // situação dos chefes de mundo
    this.broadcast("chat", { kind: "sys", text: `${p.name} entrou no mundo.` }, { except: client });
  }

  async onLeave(client: Client) {
    tradeLeave(this, client.sessionId);
    { const so = this.sess.get(client.sessionId); if (so) guildLeave(this, so); }
    const p = this.state.players.get(client.sessionId), s = this.sess.get(client.sessionId);
    if (p) this.broadcast("chat", { kind: "sys", text: `${p.name} saiu do mundo.` }, { except: client });
    if (s) { this.pvp.leaveGame(s); this.dg.leave(s, false); for (const dd of this.wd.values()) if (dd.owner === client.sessionId) dd.owner = ""; this.partyOffline(client.sessionId); this.invites.delete(client.sessionId); s.saving = false; await this.save(s); }
    this.state.players.delete(client.sessionId);
    this.sess.delete(client.sessionId);
    for (const sim of this.sim.list) sim.contrib.delete(client.sessionId);
  }

  async onDispose() {
    if (this.maintT) clearInterval(this.maintT); guildDispose(this); await this.saveAll(); }
}
