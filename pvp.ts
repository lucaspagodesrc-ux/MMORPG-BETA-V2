// PvP: duelos (pedido → aceite → contagem de 5 s → luta) e Arena PK (zona separada e opcional, todos contra todos).
// O dano entre jogadores usa a MESMA fórmula das habilidades (R.hitDamage) com os ajustes de R.PVP. A vida continua no cliente
// (ele subtrai o dano que o servidor calcula, com esquiva/escudo/redução já aplicados) e o servidor mantém um verificador de vida
// (potions, regeneração, roubo de vida e curas) só para impedir "modo deus": a derrota é confirmada pelo cliente ou imposta pelo servidor.
import { pool } from "./db";
import { sendMail, mailNotify } from "./mail";
const R: any = require("./rules.js");

const PV = R.PVP, DU = R.DUEL, AR = R.ARENA;
const now = () => Date.now();
const cxOf = (x: number) => (x < -150 ? -300 : x > 1650 ? 1800 : x > 450 ? 600 : x > 150 ? 300 : 0);
const TOWNS = [{ x: 0, z: 5 }, { x: 300, z: 5 }, { x: -300, z: 5 }];
const toMail = (items: any[]) => items.map((it) => (it.k === "eq" ? { item: it, qty: 1 } : { item: { k: it.k, id: it.id }, qty: it.n }));

type Pv = {
  mode: "" | "duel" | "arena";
  hp: number; max: number;          // verificador de vida
  taken: number;                    // dano recebido desde a última restauração
  at: number;                       // último combate (dano dado ou recebido)
  by: string; byAt: number;         // último atacante e quando
  zero: number;                     // desde quando o verificador está zerado
  ccImm: number;                    // imune a controle até
  prot: number;                     // proteção contra dano (entrada/reaparecimento na arena) até
  rs: number;                       // arena: reaparece em (0 = vivo)
  home?: { x: number; z: number };  // arena: onde estava ao entrar
  streak: number; kills: number; deaths: number; pts: number;   // arena: desta visita
  vic: Record<string, number[]>;    // arena: carimbos dos abates por vítima (limita pontos repetidos)
  reg: number;                      // último passo do verificador
};
type Duel = { id: number; a: string; b: string; st: "count" | "fight"; fightAt: number; endAt: number; cx: number; cz: number; reg: number; out: Record<string, number> };

export class Pvp {
  duels = new Map<number, Duel>();
  of = new Map<string, Duel>();                                   // jogador → duelo
  req = new Map<string, { from: string; until: number }>();       // alvo → pedido pendente
  lastReq = new Map<string, number>();                            // quem pediu → quando (contra spam)
  declined = new Map<string, number>();                           // "de>para" → não pedir de novo até
  arena = new Set<string>();                                      // jogadores na arena
  private seq = 0;
  private tkAt = 0;
  constructor(private room: any) {}

  /* ---------- utilidades ---------- */
  private S(sid: string) { return this.room.sess.get(sid); }
  private P(sid: string) { return this.room.state.players.get(sid); }
  private sys(s: any, text: string) { s?.client.send("chat", { kind: "sys", text }); }
  private name(sid: string) { return this.P(sid)?.name || "Jogador"; }
  /** envia a quem está por perto (mesma região, até 70 m) e aos jogadores citados */
  private near(sid: string, type: string, msg: any, ...also: string[]) {
    const p = this.P(sid); if (!p) return;
    for (const [id, o] of this.room.sess) {
      const q = this.P(id); if (!q) continue;
      if (id === sid || also.includes(id) || (q.inst === p.inst && cxOf(q.x) === cxOf(p.x) && Math.hypot(q.x - p.x, q.z - p.z) < 70)) o.client.send(type, msg);
    }
  }
  pv(s: any): Pv {
    return s.pv || (s.pv = { mode: "", hp: 1, max: 1, taken: 0, at: 0, by: "", byAt: 0, zero: 0, ccImm: 0, prot: 0, rs: 0, streak: 0, kills: 0, deaths: 0, pts: 0, vic: {}, reg: now() });
  }
  inPvp(s: any) { return !!(s && s.pv && s.pv.mode); }
  /** restaura o verificador (vida cheia) — o cliente restaura a vida dele junto */
  private fresh(s: any) {
    const v = this.pv(s), st = this.room.stats(s);
    v.max = Math.max(1, st.maxHp); v.hp = v.max; v.taken = 0; v.zero = 0; v.by = ""; v.byAt = 0; v.at = 0; v.reg = now();
    s.cd = Array(8).fill(0); s.busyUntil = 0;
  }
  private nearArenaNpc(s: any) {
    const p = this.P(s.client.sessionId); if (!p) return false;
    return R.NPCS.some((n: any) => n.tabs && n.tabs.includes("arena") && cxOf(n.x) === cxOf(p.x) && Math.hypot(n.x - p.x, n.z - p.z) <= 8);
  }
  private sameParty(a: any, b: any) { return !!a.partyId && a.partyId === b.partyId; }

  /* ---------- alvo "jogador" (imita um monstro para o código das habilidades) ---------- */
  px(ts: any): any {
    if (ts.px) return ts.px;
    const room = this.room, sid = ts.client.sessionId, P = () => room.state.players.get(sid);
    const m: any = {
      id: -1, lvl: ts.c.level,
      get x() { return P()?.x ?? 0; }, set x(_v: number) { /* jogadores não são empurrados */ },
      get z() { return P()?.z ?? 0; }, set z(_v: number) { /* idem */ },
      get alive() { const p = P(); return !!p && !p.dead; }, set alive(_v: boolean) { /* idem */ },
      get hp() { return ts.pv ? ts.pv.hp : 1; }, get maxHp() { return ts.pv ? ts.pv.max : 1; },
    };
    return (ts.px = { pv: ts, sid, m, get inst() { return P()?.inst || 0; }, bs: 1, def: 0, markUntil: 0, immune: false, boss: false, lazy: false, T: { n: ts.c.name }, contrib: new Map() });
  }
  /** quem `s` pode ferir agora */
  foes(s: any): any[] {
    const v = s.pv; if (!v || !v.mode) return [];
    const sid = s.client.sessionId, p = this.P(sid); if (!p || p.dead) return [];
    if (v.mode === "duel") {
      const d = this.of.get(sid); if (!d || d.st !== "fight") return [];
      const f = this.S(d.a === sid ? d.b : d.a), q = f && this.P(f.client.sessionId);
      return f && q && !q.dead && f.pv && f.pv.mode === "duel" ? [this.px(f)] : [];
    }
    if (now() < v.prot || v.rs) return [];
    const out: any[] = [];
    for (const id of this.arena) {
      if (id === sid) continue; const o = this.S(id), q = this.P(id);
      if (o && q && !q.dead && o.pv && o.pv.mode === "arena" && now() >= o.pv.prot && !o.pv.rs && !this.sameParty(s, o)) out.push(this.px(o));
    }
    return out;
  }
  target(s: any, pid: string) { return this.foes(s).find((q) => q.sid === pid); }

  /* ---------- dano ---------- */
  hit(s: any, q: any, mult: number, o: any = {}) {
    const room = this.room, ts = q.pv, sidA = s.client.sessionId, sidB = ts.client.sessionId;
    if (!this.foes(s).includes(q)) return;
    const A = this.P(sidA), B = this.P(sidB); if (!A || !B || A.dead || B.dead || R.inTown(A.x, A.z) || R.inTown(B.x, B.z)) return;
    const V = room.stats(ts), vm = this.pv(ts), t = now();
    vm.at = t; s.pv.at = t;
    const SA = room.stats(s), av = R.defRoll(V, SA, room.buff(ts, "evade"));        // Evasão (vs Acerto) e Taxa de Defesa/bloqueio (vs Ignorar Bloqueio)
    if (av) { this.near(sidB, "pdmg", { t: sidB, by: sidA, d: 0, dg: av === "block" ? 2 : 1 }, sidA); return; }
    const buffs = { dmg: room.buff(s, "dmg"), defdmg: room.buff(s, "defdmg"), crit: room.buff(s, "crit"), combo: room.buff(s, "combo"), flat: room.buff(s, "flat") };
    const defv = V.def * (1 - room.buff(ts, "defloss")) * PV.def * (1 - (o.pierce || 0));
    const r = R.hitDamage(SA, { mult, basic: o.basic, defMult: o.defMult, exec: o.exec, forceCrit: o.forceCrit, marked: t < q.markUntil, buffs }, { def: defv, hp: vm.hp, maxHp: vm.max, v: V });
    let d = r.dmg * R.pvpK(s.c.cls, s.c.level);
    d *= 1 - Math.min(0.85, room.buff(ts, "shield"));
    d = R.flatRed(V, SA, d);                                                              // Redução de Danos (menos o "Ignorar" do atacante)
    this.damage(s, ts, d, !!r.crit);
    // v1.53: a Absorção de HP/MP não funciona contra jogadores (duelo e Arena), só em monstros
    this.cc(ts, o);
    const cl = s.clone;                                                                   // Pierrot: os clones atacam junto
    if (!o.noClone && cl && cl.until > t) for (let n = 0; n < cl.n; n++) room.later(110 + n * 80, () => this.hit(s, q, mult * cl.mult, { noClone: true, basic: o.basic }));
  }
  dot(s: any, q: any, dmg: number, slow = 0) {
    const room = this.room, ts = q.pv; if (!this.foes(s).includes(q)) return;
    const V = room.stats(ts); let d = dmg * (1 - Math.min(0.85, room.buff(ts, "shield"))) * (1 - (V.drate || 0));
    d = Math.max(1, Math.round(d)); this.damage(s, ts, d, false);
    if (slow) this.cc(ts, { slow });
  }
  private damage(s: any, ts: any, d: number, crit: boolean) {
    const room = this.room, sidA = s.client.sessionId, sidB = ts.client.sessionId, vm = this.pv(ts), t = now();
    const w = ts.ward;                                                  // Égide do Guardião: absorve o dano antes da vida (Arena PK; em duelo não existe)
    if (w && w.v > 0 && w.until > Date.now() && vm.mode !== "duel") {
      const a = Math.min(w.v, d); w.v -= a; d = Math.round(d - a); ts.client.send("ward", { v: w.v, hit: a });
      if (d <= 0) { vm.at = t; vm.by = sidA; vm.byAt = t; s.pv.at = t; this.near(sidB, "pdmg", { t: sidB, by: sidA, d: 0, dg: 3 }, sidA); return; }
    }
    vm.hp = Math.max(-vm.max, vm.hp - d); vm.taken += d; vm.at = t; vm.by = sidA; vm.byAt = t; s.pv.at = t;
    if (vm.hp <= 0 && !vm.zero) vm.zero = t;
    this.near(sidB, "pdmg", { t: sidB, by: sidA, d, c: crit ? 1 : 0 }, sidA);
    ts.client.send("phit", { d, by: sidA });
  }
  /** controle de grupo em jogador: duração limitada, com imunidade logo depois (nada de "stun eterno") */
  private cc(ts: any, o: any) {
    const vm = this.pv(ts), t = now(); let k = "", ms = 0;
    if (o.stun || o.lift) { k = "stun"; ms = Math.min(o.pvpStun || o.stun || o.lift || 0, PV.cc.stun); }
    else if (o.root) { k = "root"; ms = Math.min(o.root, PV.cc.root); }
    else if (o.pull) { k = "stun"; ms = Math.min(500, PV.cc.stun); }
    else if (o.slow) { k = "slow"; ms = Math.min(o.slow, PV.cc.slow); }
    if (!k || ms <= 0) return;
    if (k !== "slow") { if (t < vm.ccImm) return; vm.ccImm = t + ms + PV.cc.imm; }
    ts.client.send("pcc", { k, ms });
  }
  /** cura aceita pelo verificador */
  heal(s: any, n: number) { const v = s.pv; if (!v || !v.mode || !(n > 0)) return; v.hp = Math.min(v.max, v.hp + n); if (v.hp > 0) v.zero = 0; }
  onPotion(s: any, kind: string) { const v = s.pv; if (!v || !v.mode) return; const pt = R.POTS && R.POTS[kind]; if (pt && kind[0] === "h") this.heal(s, v.max * pt.pct * PV.potK); }
  onHealSkill(s: any, sk: any) {
    const v = s.pv; if (!v || !v.mode) return;
    this.heal(s, v.max * (sk.pct || 0));
    if (sk.hot) for (let k = 1; k <= (sk.hotDur || 0); k++) this.room.later(k * 1000, () => this.heal(s, sk.hot));
  }

  /* ---------- duelos ---------- */
  private canDuel(s: any, ts: any, answering = false): string {
    if (!ts) return "Jogador não encontrado.";
    if (ts === s) return "Você não pode duelar consigo mesmo.";
    const a = s.client.sessionId, b = ts.client.sessionId, p = this.P(a), q = this.P(b);
    if (!p || !q) return "Jogador não encontrado.";
    if (p.dead || q.dead) return "Não dá para duelar com alguém caído.";
    if (this.of.has(a)) return "Você já está em um duelo.";
    if (this.of.has(b)) return `${q.name} já está em um duelo.`;
    if ((s.pv && s.pv.mode === "arena") || (ts.pv && ts.pv.mode === "arena") || R.arenaIn(p.x) || R.arenaIn(q.x)) return "Dentro da Arena não há duelos: lá todos lutam contra todos.";
    if (p.inst || q.inst) return "Duelos só valem no mundo aberto (não em calabouços).";
    if (cxOf(p.x) !== cxOf(q.x)) return `${q.name} está em outra região.`;
    if (R.inTown(p.x, p.z) || R.inTown(q.x, q.z)) return "Duelos não são permitidos na zona segura: afaste-se da cidade.";
    if (Math.hypot(p.x - q.x, p.z - q.z) > DU.maxDist) return `Chegue mais perto de ${q.name} (no máximo ${DU.maxDist} m).`;
    if (!answering && ts.noDuel) return `${q.name} não está aceitando duelos.`;
    return "";
  }
  request(s: any, m: any) {
    const a = s.client.sessionId, t = now();
    const ts = m?.pid ? this.S(String(m.pid)) : this.room.findByName(String(m?.name || ""));
    const err = this.canDuel(s, ts); if (err) return this.sys(s, "⚔️ " + err);
    const b = ts.client.sessionId, nb = this.name(b);
    if (t - (this.lastReq.get(a) || 0) < DU.spam) return;
    if ((this.declined.get(a + ">" + b) || 0) > t) return this.sys(s, `⚔️ ${nb} recusou há pouco. Espere um instante para pedir de novo.`);
    const cur = this.req.get(b); if (cur && cur.until > t) return this.sys(s, `⚔️ ${nb} já tem um desafio pendente.`);
    for (const [to, r] of this.req) if (r.from === a && r.until > t) { this.req.delete(to); this.sys(this.S(to), "⚔️ O desafio foi cancelado."); }
    this.lastReq.set(a, t); this.req.set(b, { from: a, until: t + DU.ask });
    ts.client.send("dinv", { from: a, name: this.name(a), lv: s.c.level, cls: s.c.cls, ms: DU.ask });
    this.sys(s, `⚔️ Desafio enviado a ${nb}. Ele tem ${Math.round(DU.ask / 1000)} s para aceitar.`);
  }
  answer(s: any, m: any) {
    const b = s.client.sessionId, rq = this.req.get(b); this.req.delete(b);
    if (!rq || now() > rq.until) return;
    const f = this.S(rq.from); if (!f) return this.sys(s, "Quem desafiou saiu do jogo.");
    if (!m?.ok) { this.declined.set(rq.from + ">" + b, now() + DU.decl); return this.sys(f, `⚔️ ${this.name(b)} recusou o duelo.`); }
    const err = this.canDuel(f, s, true); if (err) { this.sys(s, "⚔️ " + err); this.sys(f, "⚔️ " + err); return; }
    this.start(f, s);
  }
  private start(f: any, s: any) {
    const a = f.client.sessionId, b = s.client.sessionId, pa = this.P(a), pb = this.P(b), t = now();
    const d: Duel = { id: ++this.seq, a, b, st: "count", fightAt: t + DU.count, endAt: t + DU.count + DU.limit, cx: (pa.x + pb.x) / 2, cz: (pa.z + pb.z) / 2, reg: cxOf(pa.x), out: {} };
    this.duels.set(d.id, d); this.of.set(a, d); this.of.set(b, d);
    this.room.sim.noAggro.add(a); this.room.sim.noAggro.add(b);       // duelo justo: monstros ignoram os dois até o fim
    for (const [me, fo] of [[f, s], [s, f]]) {
      const v = this.pv(me); v.mode = "duel"; v.prot = 0; v.rs = 0; this.fresh(me); this.room.clearWard(me, "duel");
      const fp = this.P(fo.client.sessionId);
      me.client.send("duel", { st: "count", ms: DU.count, limit: DU.limit, cx: d.cx, cz: d.cz, r: DU.r, out: DU.out, foe: { id: fo.client.sessionId, name: fp.name, lv: fp.level, cls: fp.cls } });
    }
  }
  surrender(s: any) { const d = this.of.get(s.client.sessionId); if (d) this.endDuel(d, s.client.sessionId, "desistiu"); }
  private endDuel(d: Duel, loser: string | null, why: string) {
    if (!this.duels.delete(d.id)) return; this.of.delete(d.a); this.of.delete(d.b);
    this.room.sim.noAggro.delete(d.a); this.room.sim.noAggro.delete(d.b);
    for (const sid of [d.a, d.b]) {
      const s = this.S(sid); if (!s) continue;
      const v = this.pv(s); v.mode = ""; v.zero = 0;
      const win = loser === null ? 2 : loser === sid ? 0 : 1;
      if (win !== 2) { s.c.dl = s.c.dl || { w: 0, l: 0 }; if (win) s.c.dl.w++; else s.c.dl.l++; this.room.touch(s); }
      s.client.send("duel", { st: "end", win, why, w: s.c.dl ? s.c.dl.w : 0, l: s.c.dl ? s.c.dl.l : 0 });
    }
    if (loser !== null) {
      const w = loser === d.a ? d.b : d.a, msg = `⚔️ ${this.name(w)} venceu ${this.name(loser)} em um duelo!`;
      const pw = this.P(w);
      for (const [id, o] of this.room.sess) { const q = this.P(id); if (q && pw && (id === d.a || id === d.b || (cxOf(q.x) === cxOf(pw.x) && !q.inst && Math.hypot(q.x - pw.x, q.z - pw.z) < 60))) this.sys(o, msg); }
    }
  }
  /** o cliente informa que a vida dele acabou */
  down(s: any) {
    const sid = s.client.sessionId, v = this.pv(s);
    if (v.mode === "duel") { const d = this.of.get(sid); if (d && d.st === "fight" && v.taken >= v.max * 0.9) this.endDuel(d, sid, "vida"); else if (d && d.st === "fight") s.client.send("pvhp", { hp: Math.max(1, Math.round(v.hp)) }); return; }
    if (v.mode === "arena" && !v.rs) {
      if (v.taken >= v.max * 0.9 && v.by && now() - v.byAt < 20000) this.arenaDeath(s, v.by);
      else s.client.send("pvhp", { hp: Math.max(1, Math.round(v.hp)) });
    }
  }
  /** morreu por outra causa (monstro) durante um duelo = derrota; na Arena conta como queda */
  onDied(s: any) {
    const sid = s.client.sessionId, v = this.pv(s), d = this.of.get(sid);
    if (v.mode === "duel" && d) this.endDuel(d, sid, "caiu");
    else if (v.mode === "arena" && !v.rs) this.arenaDeath(s, v.by && now() - v.byAt < 20000 ? v.by : "");
  }
  chat(s: any, text: string): boolean {
    const m = /^\/(duelo|duel)\s+(on|off)$/i.exec(text);
    if (m) { s.noDuel = m[2].toLowerCase() === "off"; this.sys(s, s.noDuel ? "⚔️ Você não receberá mais pedidos de duelo (/duelo on para voltar)." : "⚔️ Pedidos de duelo liberados."); return true; }
    if (/^\/(render|desistir)$/i.test(text)) { this.surrender(s); return true; }
    return false;
  }

  /* ---------- Arena PK ---------- */
  private spawnPoint(except?: string) {
    let best = { x: AR.x, z: AR.z + AR.spawnR }, bd = -1;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, x = AR.x + Math.cos(a) * AR.spawnR, z = AR.z + Math.sin(a) * AR.spawnR;
      let md = 1e9; for (const id of this.arena) { if (id === except) continue; const q = this.P(id); if (q && !q.dead) md = Math.min(md, Math.hypot(q.x - x, q.z - z)); }
      if (md > bd) { bd = md; best = { x, z }; }
    }
    return best;
  }
  arenaMsg(s: any, m: any) {
    const op = String(m?.op || "");
    if (op === "enter") return this.enter(s);
    if (op === "leave") return this.leave(s, false);
    if (op === "revive") { const p = this.P(s.client.sessionId); if (p && p.dead && s.pv && s.pv.mode === "arena") this.leave(s, true); return; }   // caído na Arena: volta à cidade e renasce
    if (op === "rank") return void this.rank(s);
  }
  private enter(s: any) {
    const sid = s.client.sessionId, p = this.P(sid); if (!p) return;
    if (this.arena.has(sid)) return;
    if (p.dead) return this.sys(s, "🏟️ Você está caído.");
    if (!this.nearArenaNpc(s)) return this.sys(s, "🏟️ Fale com o Mestre da Arena (ou aproxime-se dele) para entrar.");
    if (s.c.level < AR.minLv) return this.sys(s, `🏟️ A Arena PK exige nível ${AR.minLv}.`);
    if (p.inst) return this.sys(s, "🏟️ Saia do calabouço primeiro.");
    if (this.of.has(sid)) return this.sys(s, "🏟️ Termine o duelo antes de entrar na Arena.");
    const v = this.pv(s), sp = this.spawnPoint();
    v.mode = "arena"; v.home = { x: p.x, z: p.z }; v.prot = now() + AR.prot; v.rs = 0; v.streak = 0; v.kills = 0; v.deaths = 0; v.pts = 0; v.vic = {};
    this.fresh(s); this.arena.add(sid);
    p.x = sp.x; p.z = sp.z; s.budget = 20; s.t = s.tpAt = now();
    s.client.send("arena", { st: "in", x: sp.x, z: sp.z, ms: AR.prot, pk: s.c.pk || { k: 0, d: 0, p: 0, bs: 0 } });
    this.sys(s, `🏟️ Você entrou na Arena PK! Todos lutam contra todos; ao cair você precisa voltar à cidade para renascer (sem perder nada).`);
    this.claim(s).catch(() => {});
  }
  leave(s: any, forced: boolean) {
    const sid = s.client.sessionId, p = this.P(sid), v = this.pv(s); if (!p || v.mode !== "arena") return;
    if (!forced) {
      if (p.dead || v.rs) return this.sys(s, "🏟️ Espere reaparecer para sair.");
      if (now() - v.at < AR.leave) return this.sys(s, `🏟️ Você está em combate: espere ${Math.ceil((AR.leave - (now() - v.at)) / 1000)} s para sair.`);
    }
    const h = v.home || TOWNS[0];
    v.mode = ""; v.rs = 0; v.prot = 0; this.arena.delete(sid);
    p.dead = false; p.x = h.x; p.z = h.z; s.budget = 20; s.t = s.tpAt = now();
    s.client.send("arena", { st: "out", x: h.x, z: h.z, k: v.kills, d: v.deaths, p: v.pts });
    this.sys(s, `🏟️ Você saiu da Arena: ${v.kills} abate(s), ${v.deaths} queda(s), ${v.pts} ponto(s) nesta visita.`);
  }
  private arenaDeath(vs: any, killerSid: string) {
    const sid = vs.client.sessionId, p = this.P(sid), v = this.pv(vs), t = now(); if (!p || v.rs) return;
    const ks = this.S(killerSid), kn = ks ? this.name(killerSid) : "alguém";
    v.deaths++; v.streak = 0; v.rs = Number.MAX_SAFE_INTEGER; v.zero = 0; p.dead = true;   // caído: só renasce voltando à cidade (op "revive")
    vs.c.pk = vs.c.pk || { k: 0, d: 0, p: 0, bs: 0 }; vs.c.pk.d++; this.room.touch(vs);
    let pts = 0;
    if (ks && ks.pv && ks.pv.mode === "arena") {
      const kv = ks.pv, list = (kv.vic[vs.charId] = (kv.vic[vs.charId] || []).filter((x: number) => t - x < AR.pts.sameMs));
      if (list.length < AR.pts.same) pts = AR.pts.kill + AR.pts.streak * Math.min(kv.streak, AR.pts.cap);
      list.push(t); kv.kills++; kv.streak++; kv.pts += pts;
      ks.c.pk = ks.c.pk || { k: 0, d: 0, p: 0, bs: 0 }; ks.c.pk.k++; ks.c.pk.p += pts; ks.c.pk.bs = Math.max(ks.c.pk.bs, kv.streak); this.room.touch(ks);
      ks.client.send("arena", { st: "kill", v: this.name(sid), pts, streak: kv.streak, pk: ks.c.pk });
      this.week(ks, pts, 1, 0); if (kv.streak >= 3) for (const id of this.arena) this.sys(this.S(id), `🏟️ ${kn} está em sequência de ${kv.streak} abates!`);
    }
    this.week(vs, 0, 0, 1);
    vs.client.send("arena", { st: "dead", by: kn, ms: 0, pk: vs.c.pk });
    for (const id of this.arena) this.S(id)?.client.send("pkfeed", { k: kn, v: this.name(sid), pts });
  }
  private week(s: any, pts: number, k: number, d: number) {
    pool.query(`insert into arena_rank(wk,cid,name,cls,level,pts,k,d) values($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict (wk,cid) do update set name=$3, cls=$4, level=$5, pts=arena_rank.pts+$6, k=arena_rank.k+$7, d=arena_rank.d+$8`,
      [R.weekKey(now()), s.charId, s.c.name, s.c.cls, s.c.level, pts, k, d]).catch((e: any) => console.error("[arena] ranking", e));
  }
  async rank(s: any) {
    try {
      const wk = R.weekKey(now());
      const top = (await pool.query("select name,cls,level,pts,k,d from arena_rank where wk=$1 and pts>0 order by pts desc, k desc, d asc limit 10", [wk])).rows;
      const me = (await pool.query("select pts,k,d from arena_rank where wk=$1 and cid=$2", [wk, s.charId])).rows[0] || { pts: 0, k: 0, d: 0 };
      let pos = 0; if (me.pts > 0) pos = (await pool.query("select count(*)::int as n from arena_rank where wk=$1 and pts>$2", [wk, me.pts])).rows[0].n + 1;
      s.client.send("arena", { st: "rank", top, me: { ...me, pos }, left: Math.max(0, Math.round((R.weekEnd(now()) - now()) / 1000)), pk: s.c.pk || { k: 0, d: 0, p: 0, bs: 0 }, dl: s.c.dl || { w: 0, l: 0 }, prize: AR.prize, minPts: AR.minPts });
      this.claim(s).catch(() => {});
    } catch (e) { console.error("[arena] rank", e); }
  }
  /** prêmio do top 3 da semana anterior (uma vez), entregue por correio */
  async claim(s: any) {
    const wk = R.weekKey(now()) - 1, cid = s.charId;
    const r = (await pool.query("select pts,claimed from arena_rank where wk=$1 and cid=$2", [wk, cid])).rows[0];
    if (!r || r.claimed || r.pts < AR.minPts) return;
    const pos = (await pool.query("select count(*)::int as n from arena_rank where wk=$1 and pts>$2", [wk, r.pts])).rows[0].n;
    if (pos >= AR.prize.length) return;
    const u = await pool.query("update arena_rank set claimed=true where wk=$1 and cid=$2 and not claimed", [wk, cid]); if (!u.rowCount) return;
    const pr = R.arenaPrize(s.c, pos);
    await sendMail(s.acc.id, { kind: "arena", title: `🏟️ Prêmio da Arena — ${pos + 1}º lugar`, body: `Você ficou em ${pos + 1}º lugar no ranking semanal da Arena PK (${r.pts} pontos).`, gold: pr.gold, items: toMail(pr.items) });
    await mailNotify(this.room, s.acc.id);
    this.sys(s, `🏟️ Você ficou em ${pos + 1}º lugar na Arena PK da semana passada! O prêmio chegou pelo Correio.`);
  }

  /* ---------- ciclo de vida ---------- */
  /** saiu do jogo: derrota no duelo e retorno da arena (a posição salva volta para a cidade) */
  leaveGame(s: any) {
    const sid = s.client.sessionId, d = this.of.get(sid); if (d) this.endDuel(d, sid, "saiu do jogo");
    this.room.sim.noAggro.delete(sid);
    this.req.delete(sid); for (const [to, r] of this.req) if (r.from === sid) this.req.delete(to);
    this.lastReq.delete(sid); for (const k of [...this.declined.keys()]) if (k.startsWith(sid + ">") || k.endsWith(">" + sid)) this.declined.delete(k);    // não deixa lixo na memória
    const v = s.pv; if (v && v.mode === "arena") { const p = this.P(sid), h = v.home || TOWNS[0]; if (p) { p.x = h.x; p.z = h.z; p.dead = false; } v.mode = ""; }
    this.arena.delete(sid);
  }
  tick() {
    const t = now(); if (t < this.tkAt) return; this.tkAt = t + 250;
    for (const [to, r] of this.req) if (r.until < t) { this.req.delete(to); this.sys(this.S(r.from), `⚔️ ${this.name(to)} não respondeu ao desafio.`); }
    for (const d of [...this.duels.values()]) this.tickDuel(d, t);
    for (const sid of [...this.arena]) this.tickArena(sid, t);
    for (const [id, s] of this.room.sess) { const v = s.pv; if (v && v.mode && t - v.reg >= 1000) this.regen(s, v, t); }
  }
  private tickDuel(d: Duel, t: number) {
    const sa = this.S(d.a), sb = this.S(d.b);
    if (!sa || !sb) return this.endDuel(d, !sa ? d.a : d.b, "saiu do jogo");
    if (d.st === "count" && t >= d.fightAt) {
      d.st = "fight";
      for (const s of [sa, sb]) { this.fresh(s); s.client.send("duel", { st: "fight", ms: DU.limit }); }
    }
    for (const [sid, s] of [[d.a, sa], [d.b, sb]] as [string, any][]) {
      const p = this.P(sid); if (!p) return this.endDuel(d, sid, "saiu do jogo");
      if (p.dead) return this.endDuel(d, sid, "caiu");
      if (R.inTown(p.x, p.z) || p.inst || R.arenaIn(p.x) || cxOf(p.x) !== d.reg) return this.endDuel(d, sid, "fugiu");
      if (Math.hypot(p.x - d.cx, p.z - d.cz) > DU.r) { if (!d.out[sid]) d.out[sid] = t; if (t - d.out[sid] > DU.out) return this.endDuel(d, sid, "saiu da área"); } else d.out[sid] = 0;
      const v = this.pv(s); if (d.st === "fight" && v.zero && t - v.zero > 3000 && v.taken >= v.max * 1.3) return this.endDuel(d, sid, "vida");   // o cliente não informou a derrota: o servidor impõe
    }
    if (d.st === "fight" && t >= d.endAt) this.endDuel(d, null, "tempo esgotado");
  }
  private tickArena(sid: string, t: number) {
    const s = this.S(sid), p = this.P(sid); if (!s || !p) { this.arena.delete(sid); return; }
    const v = this.pv(s);
    if (v.mode !== "arena" || !R.arenaIn(p.x)) { this.arena.delete(sid); if (v.mode === "arena") { v.mode = ""; v.rs = 0; } return; }   // saiu por outro meio (teleporte de GM etc.)
    if (v.rs && t >= v.rs) {
      const sp = this.spawnPoint(sid); v.rs = 0; v.prot = t + 3000; p.dead = false; p.x = sp.x; p.z = sp.z; s.budget = 20; s.t = s.tpAt = t; this.fresh(s);
      s.client.send("arena", { st: "resp", x: sp.x, z: sp.z, ms: 3000 });
    }
    if (!v.rs && v.zero && t - v.zero > 3000 && v.taken >= v.max * 1.3 && v.by) this.arenaDeath(s, v.by);    // verificador: cliente "modo deus"
  }
  /** verificador: regeneração natural (1,2%/s fora de combate) e gema de regeneração */
  private regen(s: any, v: Pv, t: number) {
    v.reg = t; const st = this.room.stats(s);
    if (st.rhp) this.heal(s, v.max * st.rhp);
    if (t - v.at > 5000) this.heal(s, v.max * 0.012);
  }
}
