/* v2.5.0 — Bots (jogadores automáticos) lançados por um GM.
   Cada personagem da conta GM pode lançar 1 esquadrão: 6 bots, um de cada classe ativa (até 6 GMs × 6 = 36 bots).
   Cada bot é uma conta própria (usuário "#bot_<personagem GM>_<classe>", impossível de criar ou entrar pelo site) e entra
   no mundo como um jogador comum, por WebSocket local — o servidor valida tudo igual (movimento, golpes, loja, leilão...).
   O "cérebro" de cada bot faz o papel do cliente: anda, caça monstros do seu nível, usa habilidades, bebe poções, junta
   o que cai, troca de equipamento quando o novo é melhor, vende o que não presta, anuncia itens bons no leilão, faz missões,
   distribui pontos, jura lealdade a uma nação (3 bots em cada nação por esquadrão), muda de mapa quando libera, aceita
   duelos de jogadores com nível parecido (±10%), entra na Arena PK e na Cidade das Máquinas (guerra entre nações).
   Não falam no chat. Somem depois de 2 horas ou quando o GM manda retirar. */
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { pool } from "./db";
import { findPath } from "./nav";
import { saveChar, signToken } from "./auth";
const R: any = require("./rules.js");
/* cliente do Colyseus para os bots, usando o "ws" SEM compressão (conexão local: comprimir só gastaria processador) */
let WsClient: any = null;
function wsClient() {
  if (WsClient) return WsClient;
  const WS = require("ws"), g: any = globalThis, old = Object.getOwnPropertyDescriptor(g, "WebSocket");
  class Plain extends WS { constructor(url: string, o: any) { super(url, o && o.protocols, { headers: o && o.headers, perMessageDeflate: false }); } }
  Object.defineProperty(g, "WebSocket", { value: Plain, configurable: true, writable: true });
  try { WsClient = require("colyseus.js").Client; } finally { if (old) Object.defineProperty(g, "WebSocket", old); else delete g.WebSocket; }
  return WsClient;
}

const LIFE_MS = 2 * 3600_000;        // 2 horas (cada bot, contando da entrada dele)
const GAP_MS = process.env.BOT_TEST ? 20_000 : 5 * 60_000;   // v2.6.1: os 6 bots entram um a cada 5 minutos
const MAX_SQUADS = 6;                // 6 GMs × 6 bots = 36
const TICK = 200;
const SPEED = 6.4;                   // m/s a pé (o servidor aceita até 14)
const ACTIVE = (): string[] => Object.keys(R.CLASSES).filter((k) => !(R.CLS_OFF && R.CLS_OFF[k]));

/* nomes de personagens de filmes de fantasia e ficção (Senhor dos Anéis, Matrix, Star Wars, Duna, Blade Runner...); 1 = feminino */
const NAMES: [string, number][] = [
  ["Aragorn", 0], ["Arwen", 1], ["Legolas", 0], ["Galadriel", 1], ["Gimli", 0], ["Eowyn", 1], ["Boromir", 0], ["Tauriel", 1],
  ["Faramir", 0], ["Rosie", 1], ["Gandalf", 0], ["Goldberry", 1], ["Frodo", 0], ["Lobelia", 1], ["Samwise", 0], ["Idril", 1],
  ["Elrond", 0], ["Luthien", 1], ["Theoden", 0], ["Morwen", 1], ["Eomer", 0], ["Nimrodel", 1], ["Haldir", 0], ["Celebrian", 1],
  ["Neo", 0], ["Trinity", 1], ["Morpheus", 0], ["Niobe", 1], ["Tank", 0], ["Switch", 1], ["Apoc", 0], ["Persephone", 1],
  ["Seraph", 0], ["Sati", 1], ["Luke", 0], ["Leia", 1], ["Han Solo", 0], ["Padme", 1], ["Obi-Wan", 0], ["Rey", 1],
  ["Atreides", 0], ["Chani", 1], ["Stilgar", 0], ["Jessica", 1], ["Deckard", 0], ["Rachael", 1], ["Roy Batty", 0], ["Pris", 1],
  ["Jake Sully", 0], ["Neytiri", 1], ["Kyle Reese", 0], ["Sarah Connor", 1], ["Ripley", 1], ["Furiosa", 1], ["Max Rockatansky", 0], ["Thranduil", 0],
];
const BANNED = new Set(["caio rocha"]);   // nomes que não podem ser usados (bots que já tinham esse nome ganham outro)
const STAT: Record<string, Record<string, number>> = {     // como cada classe distribui os pontos (proporção)
  guerreiro: { str: 3, vit: 1 }, cavaleiro: { str: 2, vit: 2 }, tanque: { vit: 2, str: 2 }, arqueiro: { agi: 3, vit: 1 },
  assassino: { agi: 2, str: 1, vit: 1 }, mago: { int: 3, vit: 1 }, pierrot: { int: 2, agi: 1, vit: 1 },
};
/* portais (iguais aos do servidor) */
const PORT: Record<string, { x: number; z: number; from: number; to: number; nat?: boolean }> = {};   // v3.0.0: vem dos NPCs (Aurora ↔ cada cidade)
for (const n of R.NPCS) if (n.portal) PORT[n.id] = { x: n.x, z: n.z, from: R.regAt(n.x, n.z), to: R.regAt(n.portal.to.x, n.portal.to.z), nat: !!n.portal.nat };
const regOf = (x: number, z = 0) => R.regAt(x, z);   // v3.0.0: região pelo lugar no mapa único
const hyp = (a: any, b: any) => Math.hypot(a.x - b.x, a.z - b.z);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const TARGETED = ["single", "dash", "aoeTarget", "multi", "barrage", "mark", "chainPull", "thunder", "arcRay"];
const DIRECTED = ["shieldThrow", "shieldBeam", "daggerFan", "roll", "stab3", "foilThrow", "xslash"];
const SELFBUFF = ["buff", "transform", "clone"];
/* zonas de caça (sem chefes, sem chefes de mundo, sem bonecos de treino) */
let HUNT0: any[] | null = null;
const HUNT = (): any[] => HUNT0 || (HUNT0 = R.ZONES.filter((z: any) => !z.wb && z.t !== "espantalho" && z.n > 1 && R.MT[z.t])
  .map((z: any) => ({ ...z, reg: regOf(z.x, z.z), lo: R.MT[z.t].lv[0], hi: R.MT[z.t].lv[1] })));

type Mon = { id: number; type: string; lvl: number; maxHp: number; inst: number; x: number; z: number; hp: number; alive: boolean };
type Task = { x: number; z: number; r: number; reg: number; fn: () => void; why: string };

class Bot {
  room: any = null; c: any = null; sid = ""; timer: any = null; alive = true;
  pos = { x: 0, z: 5 }; hp = 1; mp = 1; dead = false; deadAt = 0; lastT = Date.now(); rg = 0; lastCombat = 0;
  mons = new Map<number, Mon>(); drops = new Map<number, any>();
  cd: number[] = Array(9).fill(0); actUntil = 0; skUntil = 0; nextAtk = 0; potAt = 0; buffUntil: number[] = Array(9).fill(0);
  mode = "idle"; modeUntil = 0; tasks: Task[] = []; taskAt = 0; zone: any = null; path: { x: number; z: number }[] | null = null; pathTo = { x: 0, z: 0 }; pathAt = 0; zoneAt = 0; qAt = 0; prefT = ""; qTry: Record<string, number> = {}; qTryReset = 0; tgt: Mon | null = null; wander: any = null; stuckT = 0;
  until = Date.now() + LIFE_MS;
  pv = ""; foe = ""; pvAt = 0; pdownAt = 0; arenaUntil = 0; nextArena = Date.now() + (process.env.BOT_TEST ? rnd(20, 40) * 1000 : rnd(8, 25) * 60_000); nextWar = 0;
  lastAct = 0; hpSent = 0; recallAt = 0; nextTown = Date.now() + rnd(6, 12) * 60_000; lastPick = 0; deathLog = 0;
  constructor(public sq: Squad, public acc: { id: number; username: string }, public charId: string, public slot: number, public nat: number) {}
  dC: any = null; dAt: any = null;
  D() { if (this.dAt !== this.c || !this.dC) { this.dC = R.stats(this.c); this.dAt = this.c; } return this.dC; }
  log(...a: any[]) { if (process.env.BOT_LOG) console.log(`[bot ${this.c ? this.c.name : this.charId}]`, ...a); }

  async start(port: number) {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    const Cl = wsClient(), cl = new Cl(`ws://127.0.0.1:${port}`), opt = { token: signToken(this.acc), charId: this.charId };
    let room: any; try { room = await cl.join("world", opt); }                       // join (não cria outra sala)...
    catch { room = await cl.joinOrCreate("world", opt); }                            // ...a não ser que o servidor tenha acabado de voltar e ainda não exista sala
    this.mons.clear(); this.drops.clear(); this.tasks = []; this.zone = null; this.tgt = null; this.pv = ""; this.dead = false;
    this.room = room; this.sid = room.sessionId;
    room.onMessage("sync", (m: any) => { if (m && m.c) { const first = !this.c; this.c = m.c; if (first) { const d = this.D(); this.hp = d.maxHp; this.mp = d.maxMp; } this.afterSync(); } });
    room.onMessage("res", (m: any) => { for (const o of (m && m.out) || []) if (o && o.heal) { const d = this.D(), P = R.POTS[o.heal]; if (!P) continue; if (o.heal === "mp") this.mp = Math.min(d.maxMp, this.mp + d.maxMp * (P.pct || 0.4)); else this.hp = Math.min(d.maxHp, this.hp + d.maxHp * (P.pct || 0.4)); } });
    room.onMessage("mo", (d: any) => {
      for (const a of d.f || []) this.mons.set(a[0], { id: a[0], type: a[1], lvl: a[2], maxHp: a[3], inst: a[4], x: a[5] / 10, z: a[6] / 10, hp: a[8], alive: !!a[9] });
      for (const a of d.u || []) { const o = this.mons.get(a[0]); if (o) { o.x = a[1] / 10; o.z = a[2] / 10; o.hp = a[4]; o.alive = !!a[5]; } }
      for (const id of d.r || []) this.mons.delete(id);
    });
    room.onMessage("drop", (m: any) => this.drops.set(m.id, { id: m.id, item: m.item, x: m.x, z: m.z, free: Date.now() + (m.lock || 0) }));
    room.onMessage("drm", (m: any) => this.drops.delete(m.id));
    room.onMessage("mhit", (m: any) => this.hurtMon(Number(m.raw) || 0));
    room.onMessage("phit", (m: any) => { if (this.dead || !Number.isFinite(m.d)) return; this.hp -= m.d; this.lastCombat = Date.now(); if (this.hp <= 0 && Date.now() - this.pdownAt > 800) { this.pdownAt = Date.now(); this.room.send("pdown"); } });
    room.onMessage("pvhp", (m: any) => { if (Number.isFinite(m.hp)) this.hp = Math.max(1, m.hp); });
    room.onMessage("correct", (m: any) => { if (Number.isFinite(m.x)) { this.pos.x = m.x; this.pos.z = m.z; } });
    room.onMessage("dinv", (m: any) => this.onDuelInvite(m));
    room.onMessage("duel", (m: any) => {
      if (m.st === "count") { this.pv = "duel"; this.foe = m.foe && m.foe.id; this.pvAt = Date.now() + (m.ms || 5000); this.full(); }
      else if (m.st === "end") { this.pv = ""; this.foe = ""; this.full(); }
    });
    room.onMessage("arena", (m: any) => {
      if (m.st === "in") { this.pv = "arena"; this.pvAt = Date.now() + (m.ms || 5000); this.pos = { x: m.x, z: m.z }; this.full(); this.arenaUntil = Date.now() + rnd(3, 7) * 60_000; }
      else if (m.st === "out") { this.pv = ""; this.dead = false; this.pos = { x: m.x, z: m.z }; this.full(); this.nextArena = Date.now() + rnd(25, 50) * 60_000; }
      else if (m.st === "dead") { this.dead = true; this.deadAt = Date.now(); }
      else if (m.st === "resp") { this.dead = false; this.pos = { x: m.x, z: m.z }; this.full(); }
    });
    room.onMessage("war", (m: any) => {
      if (m.st === "in") { this.pv = "war"; this.pvAt = Date.now() + (m.ms || 5000); this.full(); }
      else if (m.st === "out") { this.pv = ""; }
      else if (m.st === "dead") { this.dead = true; this.deadAt = Date.now(); }
      else if (m.st === "resp") { this.dead = false; this.pos = { x: m.x, z: m.z }; this.full(); }
    });
    room.onMessage("dgenter", () => { this.room.send("dgexit", {}); });    // bots não usam calabouços (sai na hora se cair num)
    for (const k of ["chat", "xp", "ahr", "wbs", "wbmsg", "wbr", "wbend", "wbmy", "mailr", "mailn", "trr", "gs", "gr", "ginv", "gu", "ward", "abuff", "gmb", "dmg", "mat", "slam", "fx", "cl", "clspin", "clones", "dgleave", "dgmsg", "dg", "party", "pinv", "matk", "pdmg", "pkfeed", "pcc", "botst"]) room.onMessage(k, () => {});
    room.onLeave(() => { this.room = null; if (this.alive) this.reconnect(1); });   // v2.6.4: caiu a conexão com o servidor ainda no ar → tenta voltar
    this.timer = setInterval(() => { try { this.tick(); } catch (e) { if (process.env.BOT_LOG) console.error(e); } }, TICK);
  }
  reconnect(n: number) {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (!this.alive || this.sq.stopped) return;
    if (n > 6) { this.alive = false; this.sq.lost(this); return; }
    setTimeout(() => { if (!this.alive || this.sq.stopped) return; this.start(this.sq.mgr.port).then(() => console.log(`[bots] ${this.c ? this.c.name : this.charId} voltou`)).catch(() => this.reconnect(n + 1)); }, 5000 * n);
  }
  stop() { this.alive = false; if (this.timer) clearInterval(this.timer); this.timer = null; try { this.room && this.room.leave(); } catch {} this.room = null; }
  send(t: string, m?: any) { if (this.room) try { this.room.send(t, m); } catch {} }
  act(m: any) { const now = Date.now(); if (now - this.lastAct < 450) return false; this.lastAct = now; this.send("a", m); return true; }
  full() { const d = this.D(); this.hp = d.maxHp; this.mp = d.maxMp; }
  me() { return this.room && this.room.state && this.room.state.players ? this.room.state.players.get(this.sid) : null; }

  /* ---------- vida ---------- */
  hurtMon(raw: number) {
    if (this.dead || !this.c) return;
    const d = this.D(); if (R.defRoll(d, null, 0)) return;
    let dmg = raw * (1 - d.def / (d.def + 80)); dmg = R.flatRed(d, null, dmg);
    this.hp -= dmg; this.lastCombat = Date.now();
    if (this.hp <= 0) this.die();
  }
  die() {
    if (this.dead) return; this.hp = 0; this.dead = true; this.deadAt = Date.now(); this.tgt = null; this.tasks = [];
    if (this.pv) { if (Date.now() - this.pdownAt > 800) { this.pdownAt = Date.now(); this.send("pdown"); } }
    this.send("died");
  }
  regen(dt: number) {
    this.rg += dt; if (this.rg < 1) return; this.rg -= 1; if (this.dead) return;
    const d = this.D(), town = R.inTown(this.pos.x, this.pos.z), out = Date.now() - this.lastCombat > 5000;
    if (d.rhp && this.hp < d.maxHp) this.hp = Math.min(d.maxHp, this.hp + d.maxHp * d.rhp);
    if (this.hp < d.maxHp && (out || town)) this.hp = Math.min(d.maxHp, this.hp + d.maxHp * (town ? 0.05 : 0.012));
    if (this.mp < d.maxMp) this.mp = Math.min(d.maxMp, this.mp + 1.5 + d.maxMp * (town ? 0.05 : 0.015));
  }
  potion() {
    const now = Date.now(); if (now - this.potAt < (this.pv ? 6000 : 3000)) return; const d = this.D(), inv = this.c.inv || [];
    const best = (t: string) => { let k = "", pc = 0; for (const s of inv) if (s && s.k === "pot" && String(s.id).startsWith(t) && R.POTS[s.id] && R.POTS[s.id].pct > pc) { pc = R.POTS[s.id].pct; k = s.id; } return k; };
    let k = "";
    if (this.hp < d.maxHp * 0.48 && (k = best("hp"))) { this.potAt = now; this.send("a", { t: "pot", kind: k }); }
    else if (this.mp < d.maxMp * 0.22 && (k = best("mp"))) { this.potAt = now; this.send("a", { t: "pot", kind: k }); }
  }
  potCount(k: string) { return (this.c.inv || []).reduce((a: number, s: any) => a + (s && s.k === "pot" && String(s.id).startsWith(k) ? s.n || 1 : 0), 0); }
  freeSlots() { return (this.c.inv || []).filter((s: any) => !s).length; }

  /* ---------- depois de cada atualização do personagem: atributos, habilidades, equipamento, nação ---------- */
  afterSync() {
    const c = this.c; if (!c || this.dead) return;
    if (c.pts > 0) { const w = STAT[c.cls] || { str: 1, vit: 1 }, a = c.alloc || {}, tot = Object.values(w).reduce((x: number, y: number) => x + y, 0) as number, sum = Object.keys(w).reduce((x, k) => x + (a[k] || 0), 0) + 1;
      let best = "", bd = -1e9; for (const k in w) { const d = w[k] / tot - (a[k] || 0) / sum; if (d > bd) { bd = d; best = k; } }
      if (best && this.act({ t: "stat", k: best })) return; }
    if (c.sp > 0) { const C = R.CLASSES[c.cls]; let bi = -1, br = 1e9;
      C.skills.forEach((s: any, i: number) => { const r = (c.sk && c.sk[i]) || 0; if (c.level < s.lv || r >= R.MAXRANK || R.skCost(r) > c.sp) return; const k = r + (["buff", "heal", "clone", "cloak", "taunt", "foilStep", "dashBack"].includes(s.type) ? 3 : 0); if (k < br) { br = k; bi = i; } });
      if (bi >= 0 && this.act({ t: "skup", i: bi })) return; }
    if ((c.tut || 0) < 99) { if (this.act({ t: "tut", s: (c.tut || 0) < 9 ? 9 : 99 })) return; }
    const up = this.bestUpgrade(); if (up >= 0 && this.act({ t: "equip", i: up })) return;
  }
  power(c: any) { const d = R.stats(c); return (d.dmg || d.atk || 1) * (1 + Math.min(d.crit || 0, 60) / 100 * ((d.critMul || 1.5) - 1)) * (d.atkSpd || 1) + (d.def || 0) * 1.4 + (d.maxHp || 0) * 0.07; }
  usable(it: any) { const c = this.c; return it && it.k === "eq" && c.level >= (it.req || 0) && (!it.cls || it.cls === c.cls) && (it.slot !== "cape" || it.cs === R.capeKind(c.cls)); }
  /** índice do item da mochila que deixa o personagem mais forte (ou -1) — "sabe" o que é item bom ou ruim */
  bestUpgrade() {
    const c = this.c, base = this.power(c); let bi = -1, bg = base * 1.01;
    (c.inv || []).forEach((it: any, i: number) => { if (!this.usable(it)) return; const k = R.eqKey(c, it), eq = { ...c.eq, [k]: it }, p = this.power({ ...c, eq }); if (p > bg) { bg = p; bi = i; } });
    return bi;
  }
  /** itens que não servem: equipamentos que não melhoram nada (os raros+ vão ao leilão), e materiais de pouco valor quando a mochila aperta */
  junk(): { sell: number[]; auction: number[] } {
    const c = this.c, sell: number[] = [], auction: number[] = [], base = this.power(c);
    (c.inv || []).forEach((it: any, i: number) => {
      if (!it || it.bd) return;
      if (it.k === "eq") { if (this.usable(it)) { const k = R.eqKey(c, it), p = this.power({ ...c, eq: { ...c.eq, [k]: it } }); if (p > base * 1.01) return; }
        if ((it.rar || 0) >= 2 || (it.plus || 0) >= 3) auction.push(i); else sell.push(i); }
    });
    if (this.freeSlots() < 4) (c.inv || []).forEach((it: any, i: number) => { if (it && it.k === "mat" && !(R.MATS[it.id] && R.MATS[it.id].gem) && it.id !== "ferro" && it.id !== "essencia" && R.sellPrice(it) < 200) sell.push(i); });
    return { sell, auction };
  }

  /* ---------- duelo ---------- */
  onDuelInvite(m: any) {
    const c = this.c, lv = Number(m.lv) || 0;
    const ok = !!c && !this.dead && !this.pv && this.mode !== "town" && this.hp > this.D().maxHp * 0.6 && Math.abs(lv - c.level) <= Math.max(1, c.level * 0.1);   // diferença de nível de até 10%
    setTimeout(() => this.send("dans", { ok: ok ? 1 : 0 }), rnd(1500, 4500));
  }

  /* ---------- cérebro ---------- */
  tick() {
    const now = Date.now(), dt = Math.min(1, (now - this.lastT) / 1000); this.lastT = now;
    if (!this.c || !this.room) return;
    if (now > this.until) { this.stop(); this.sq.lost(this); return; }   // v2.6.1: cada bot sai 2 h depois de entrar
    const me = this.me();
    if (me && hyp(me, this.pos) > 5) { this.pos.x = me.x; this.pos.z = me.z; }   // teleporte (portal, retorno, renascer, avanço)
    this.regen(dt);
    if (now - this.hpSent > 2500) { this.hpSent = now; const d = this.D(); this.send("hp", { hp: Math.max(0, Math.round(this.hp)), mhp: Math.round(d.maxHp) }); }
    if (this.dead) { this.whileDead(now); return; }
    if (me && me.dead) { if (now - this.deadAt > 15_000) { this.dead = true; this.deadAt = now - 4000; } return; }
    this.potion();
    if (this.pv) { this.pvpTick(now); return; }
    if (now - this.lastPick > 700) this.loot(now);
    if (this.tasks.length) { this.runTasks(now); return; }
    this.decide(now);
  }
  whileDead(now: number) {
    const me = this.me();
    if (me && !me.dead && now - this.deadAt > 2500) { this.dead = false; const d = this.D(); this.hp = d.maxHp * (this.pv ? 1 : 0.7); this.mp = d.maxMp * (this.pv ? 1 : 0.5); this.tgt = null; if (!this.pv) this.nextTown = 0; return; }
    if (now - this.deadAt < (this.pv === "arena" ? 4000 : this.pv === "war" ? 7000 : rnd(5000, 8000)) || now - this.pdownAt < 3500) return;
    this.pdownAt = now;
    if (this.pv === "arena") this.send("arena", { op: "revive" }); else this.send("revive");   // na guerra o servidor faz renascer na base da nação
  }
  /* anda até (x,z) — devolve true quando chega */
  go(x: number, z: number, r = 1.2) {
    if (Math.hypot(x - this.pos.x, z - this.pos.z) <= r) { this.path = null; return true; }
    if (this.pos.x <= 450 && x <= 450) {                                // v3.0.0: no mapa, contorna rios, montanhas e muros (A*)
      const now = Date.now();
      if (!this.path || Math.hypot(this.pathTo.x - x, this.pathTo.z - z) > 3 || now - this.pathAt > 20_000) { this.path = findPath(this.pos.x, this.pos.z, x, z) || [{ x, z }]; this.pathTo = { x, z }; this.pathAt = now; }
      let w = this.path[0]; while (this.path.length > 1 && Math.hypot(w.x - this.pos.x, w.z - this.pos.z) < 1.2) { this.path.shift(); w = this.path[0]; }
      if (this.path.length > 1) { const dx = w.x - this.pos.x, dz = w.z - this.pos.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, SPEED * TICK / 1000); this.pos.x += (dx / d) * st; this.pos.z += (dz / d) * st; this.send("move", { x: this.pos.x, z: this.pos.z }); return false; }
    }
    const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz); if (d <= r) return true;
    const st = Math.min(d - r * 0.6, SPEED * TICK / 1000); this.pos.x += (dx / d) * st; this.pos.z += (dz / d) * st;
    this.send("move", { x: this.pos.x, z: this.pos.z }); return false;
  }
  /* chegar em outra região: pelos portais (sempre passando por Aurora) */
  travel(to: number, now: number) {
    const cur = regOf(this.pos.x, this.pos.z); if (cur === to || cur === 600 || cur === 1800) return true;
    // v3.0.0: Aurora tem um portal para cada cidade; das outras, o portal volta para Aurora (Máquinas: só com nação)
    const ks = Object.keys(PORT).filter((k) => PORT[k].from === cur && (cur === 0 ? PORT[k].to === to && (!PORT[k].nat || this.c.nat) : PORT[k].to === 0));
    const pid = ks.sort((a, b) => hyp(PORT[a], this.pos) - hyp(PORT[b], this.pos))[0] || "";
    const P = PORT[pid]; if (!P) return true;
    if (this.go(P.x, P.z, 3) && now - this.recallAt > 2500) { this.recallAt = now; this.send("portal", { id: pid }); }
    return false;
  }
  bestReg() {
    const lv = this.c.level, ok = (r: number) => r === 0 || (r === 300 && lv >= 50) || (r === -300 && lv >= 75) || (r === -600 && lv >= 100) || (r === -900 && lv >= 130 && this.c.nat);
    const zs = HUNT().filter((z) => ok(z.reg) && z.lo <= lv + 2); if (!zs.length) return 0;
    const top = zs.reduce((a, b) => (b.lo > a.lo ? b : a)); return top.reg;
  }
  pickZone(reg: number) {
    const lv = this.c.level, zs = HUNT().filter((z) => z.reg === reg && z.lo <= lv + 2).sort((a, b) => b.lo - a.lo);
    return zs.length ? pick(zs.slice(0, Math.min(2, zs.length))) : null;
  }
  npcs(tab: string, reg: number) { return R.NPCS.filter((n: any) => n.tabs && n.tabs.includes(tab) && regOf(n.x, n.z) === reg); }
  nearestNpc(tab: string, reg = regOf(this.pos.x, this.pos.z)) { const L = this.npcs(tab, reg); return L.length ? L.reduce((a: any, b: any) => (hyp(b, this.pos) < hyp(a, this.pos) ? b : a)) : null; }

  decide(now: number) {
    const c = this.c, d = this.D(), reg = regOf(this.pos.x, this.pos.z);
    if (reg === 600 || reg === 1800) { if (now - this.recallAt > 11_000) { this.recallAt = now; this.send("recall"); } return; }
    // 1) cidade: mochila cheia, sem poções, missões para entregar ou de tempos em tempos
    if (now > this.nextTown || this.freeSlots() <= 3 || (this.potCount("hp") < 3 && c.gold >= 150)) { this.planTown(now); if (this.tasks.length) return; }
    // 2) nação (Nv 50): metade do esquadrão em cada nação
    if (!c.nat && c.level >= R.NAT_LV) { const n = this.nearestNpc("nacao") || this.nearestNpc("nacao", 0); if (n) { this.task(n, () => this.act({ t: "nation", n: this.nat, npc: n.id }), "nação"); return; } }
    // 3) Arena PK de vez em quando
    if (c.level >= R.ARENA.minLv && now > this.nextArena && this.hp > d.maxHp * 0.9) { const n = this.nearestNpc("arena", reg); if (n) { this.nextArena = now + 60_000; this.task(n, () => this.send("arena", { op: "enter" }), "arena"); return; } }
    // 4) Cidade das Máquinas (guerra) para quem tem nação e Nv 130
    if (c.nat && c.level >= R.WAR.minLv) { if (now > this.nextWar) { this.nextWar = now + rnd(20, 40) * 60_000; this.mode = Math.random() < 0.55 ? "war" : "hunt"; }
      if (this.mode === "war") { if (!this.travel(-900, now)) { this.zone = null; return; } if (!this.zone || this.zone.reg !== -900) this.zone = this.pickZone(-900); this.prefT = ""; this.hunt(now); return; } }
    // 5) v2.6.2: missões — entrega as prontas, aceita novas (de qualquer mapa liberado), caça o alvo da missão
    if (this.questWork(now)) return;
    // 6) caçar: o alvo da missão ativa ou o spot que dá mais XP sem estar lotado (2+ jogadores → próximo spot)
    if (!this.zone || now > this.zoneAt) { const z = this.chooseZone(); if (z !== this.zone) { this.zone = z; this.wander = null; this.tgt = null; if (z) this.log("spot:", z.t, "reg", z.reg, this.prefT ? "(missão)" : "(XP)"); } this.zoneAt = now + 20_000; }
    if (!this.zone) { const t = R.WORLD.CITY[0].sp; this.go(t[0], t[1], 3); return; }
    if (!this.travel(this.zone.reg, now)) return;
    this.hunt(now);
  }
  /* ---------- v2.6.2: missões ---------- */
  regOk(r: number) { const lv = this.c.level; return r === 0 || (r === 300 && lv >= 50) || (r === -300 && lv >= 75) || (r === -600 && lv >= 100) || (r === -900 && lv >= 130 && !!this.c.nat) || (r === 1200 && lv >= 170); }   // o mapa é livre; o bot só vai onde aguenta
  qZones(q: any) { return HUNT().filter((z) => z.t === q.tg && this.regOk(z.reg)); }
  doable(q: any) { const T = R.MT[q.tg], lv = this.c.level; if (!T || T.boss || T.wb) return false; if (T.lv[0] > lv + 3 || T.lv[1] < lv - 22) return false; return this.qZones(q).length > 0; }
  crowd(z: any) { let n = 0; const P = this.room && this.room.state && this.room.state.players; if (!P) return 0; P.forEach((p: any, sid: string) => { if (sid !== this.sid && hyp(p, z) < z.r + 6) n++; }); return n; }
  questWork(now: number): boolean {
    if (now < this.qAt) return false; this.qAt = now + 4000;
    const c = this.c, st = c.quests || {}, cur = regOf(this.pos.x, this.pos.z);
    // 1) entregar as concluídas
    for (const id of Object.keys(st)) { const s0 = st[id], q = R.QUESTS.find((x: any) => x.id === id); if (!q || s0.done || s0.n < q.qty) continue;
      const n = R.NPCS.find((x: any) => x.id === q.npc); if (!n || !this.regOk(regOf(n.x, n.z))) continue;
      if ((this.qTry[id] = (this.qTry[id] || 0) + 1) > 4) continue;   // não conseguiu entregar 4 vezes: deixa para depois
      this.task(n, () => this.send("a", { t: "qt", id }), "entregar missão " + q.t); this.zoneAt = 0; return true; }
    // 2) já tem missão em andamento que dá para fazer: vai caçar
    const act = Object.keys(st).filter((id) => { const q = R.QUESTS.find((x: any) => x.id === id); return q && !st[id].done && st[id].n < q.qty && this.doable(q); });
    if (act.length >= 2) return false;
    // 3) aceitar: primeiro no mapa atual, depois nos outros mapas liberados; as mais antigas (nível menor) primeiro
    const av = R.QUESTS.filter((q: any) => { if (st[q.id] || (this.qTry[q.id] || 0) > 3 || !R.qOpen(c, q) || (q.need && q.need > c.level) || !this.doable(q)) return false; const n = R.NPCS.find((x: any) => x.id === q.npc); return n && this.regOk(regOf(n.x, n.z)); })
      .map((q: any) => ({ q, n: R.NPCS.find((x: any) => x.id === q.npc), lo: R.MT[q.tg].lv[0] }))
      .sort((a: any, b: any) => (regOf(a.n.x, a.n.z) === cur ? 0 : 1) - (regOf(b.n.x, b.n.z) === cur ? 0 : 1) || a.lo - b.lo);
    if (!av.length) return false;
    const first = av[0], take = [first, ...av.slice(1).filter((x: any) => x.n.id === first.n.id)].slice(0, 3 - act.length);
    for (const x of take) { this.qTry[x.q.id] = (this.qTry[x.q.id] || 0) + 1; this.task(x.n, () => this.send("a", { t: "qa", id: x.q.id }), "aceitar missão " + x.q.t); }
    this.zoneAt = 0; if (now > (this.qTryReset || 0)) { this.qTryReset = now + 15 * 60_000; for (const k in this.qTry) if (!take.some((x: any) => x.q.id === k)) delete this.qTry[k]; }
    return true;
  }
  zoneXp(z: any) { const T = R.MT[z.t]; try { return R.xpFor(T, Math.round((z.lo + z.hi) / 2), this.c.level) * (z.n || 1); } catch { return 0; } }
  chooseZone() {
    const c = this.c, st = c.quests || {};
    // missão ativa: o spot do alvo (o menos cheio; empate → o mais perto)
    for (const id of Object.keys(st)) { const q = R.QUESTS.find((x: any) => x.id === id); if (!q || st[id].done || st[id].n >= q.qty || !this.doable(q)) continue;
      const zs = this.qZones(q).sort((a, b) => this.crowd(a) - this.crowd(b) || hyp(a, this.pos) - hyp(b, this.pos)); this.prefT = q.tg; return zs[0]; }
    // sem missão: o spot de mais XP; com 2+ jogadores nele, o próximo (menos XP), e assim por diante
    this.prefT = "";
    const zs = HUNT().filter((z) => this.regOk(z.reg) && z.lo <= c.level + 2).sort((a, b) => this.zoneXp(b) - this.zoneXp(a));
    for (const z of zs) { const cr = this.crowd(z) - (this.zone === z ? 0 : 0); if (cr < 2) return z; }
    return zs[0] || null;
  }
  task(n: any, fn: () => void, why: string) { this.tasks.push({ x: n.x + rnd(-1.5, 1.5), z: n.z + rnd(1, 2.5), r: 2.2, reg: regOf(n.x, n.z), fn, why }); }
  runTasks(now: number) {
    const t = this.tasks[0];
    if (!this.travel(t.reg, now)) return;
    if (!this.go(t.x, t.z, t.r)) { if (now - this.taskAt > 90_000) { this.tasks.shift(); this.taskAt = now; } return; }
    if (now - this.taskAt < 900) return;
    this.taskAt = now; this.tasks.shift(); try { t.fn(); } catch {}
  }
  /** passeio na cidade: vender, comprar poções, missões, gemas, aprimorar, leilão */
  planTown(now: number) {
    const c = this.c, reg = regOf(this.pos.x, this.pos.z) === 1800 ? 0 : regOf(this.pos.x, this.pos.z);
    this.nextTown = now + rnd(9, 16) * 60_000; this.tasks = []; this.taskAt = now;
    const shop = this.nearestNpc("vender", reg) || this.nearestNpc("vender", 0); if (!shop) return;
    this.task(shop, () => { const j = this.junk(); const idx = this.freeSlots() < 6 ? [...j.sell, ...j.auction.slice(2)] : j.sell; if (idx.length) this.send("a", { t: "sellmany", npc: shop.id, idx }); }, "vender");
    const L = R.SHOPS[shop.shop || "aurora"] || [];
    const buy = (kind: string, want: number) => { const pots = L.map((x: any) => { try { const it = x.mk(c); return it.k === "pot" && String(it.id).startsWith(kind) ? { x, it } : null; } catch { return null; } }).filter(Boolean) as any[];
      pots.sort((a, b) => (R.POTS[b.it.id].pct - R.POTS[a.it.id].pct) || ((b.it.n || 1) - (a.it.n || 1)));   // a melhor poção, de preferência em pacote
      const one = pots.length ? pots[0].x : null;
      if (!one) return; let have = this.potCount(kind); for (let k = 0; k < 8 && have < want; k++) { const n = (() => { try { return one.mk(c).n || 1; } catch { return 1; } })(); have += n;
        this.tasks.push({ x: shop.x + rnd(-1, 1), z: shop.z + rnd(1, 2), r: 2.2, reg: regOf(shop.x, shop.z), why: "comprar", fn: () => { const cost = (() => { try { return one.c(this.c); } catch { return 1e9; } })(); if (this.c.gold > cost * 2.5 && this.freeSlots() > 0) this.send("a", { t: "buy", npc: shop.id, id: one.id }); } }); } };
    buy("hp", 15 + Math.min(25, Math.floor(c.level / 4)));
    if (["mago", "pierrot", "cavaleiro"].includes(c.cls) || c.level > 30) buy("mp", 8 + Math.min(15, Math.floor(c.level / 6)));
    // gemas: compra e engasta quando sobra ouro e há engaste vazio
    const gn = this.nearestNpc("engastar", reg);
    if (gn) for (const key of Object.keys(c.eq || {})) {
      const it = c.eq[key]; if (!it || it.slot === "cape" || !(it.sl > 0)) continue; const gm = Array.isArray(it.gm) ? it.gm : [], si = [...Array(it.sl).keys()].find((k) => !gm[k]); if (si === undefined) continue;
      const cat = R.gemCat(it), opts = (R.SHOPS.scr || []).filter((x: any) => x.scr && R.GEMD[x.scr] && R.GEMD[x.scr].cat === cat).sort((a: any, b: any) => a.c() - b.c());
      const g = opts.find((x: any) => this.gemFits(x.scr)) || opts[0]; if (!g || c.gold < g.c() * 3) continue;
      this.task(gn, () => this.send("a", { t: "buy", npc: gn.id, id: g.id }), "comprar gema");
      this.task(gn, () => { const gi = (this.c.inv || []).findIndex((s: any) => s && s.k === "mat" && s.id === "g_" + g.scr); if (gi >= 0) this.send("a", { t: "socket", npc: gn.id, ref: "eq:" + key, si, gi }); }, "engastar");
      break;
    }
    // aprimorar a arma (até +4) quando há material
    const fe = this.nearestNpc("aprimorar", reg), w = c.eq && c.eq.weapon;
    if (fe && w && (w.plus || 0) < 4) { try { const k = R.upCost(w), have = (id: string) => (c.inv || []).reduce((a: number, s: any) => a + (s && s.k === "mat" && s.id === id ? s.n || 1 : 0), 0); if (have("ferro") >= k.ferro && have("essencia") >= (k.essencia || 0) && c.gold > k.gold * 3) this.task(fe, () => this.send("a", { t: "up", npc: fe.id, ref: "eq:weapon" }), "aprimorar"); } catch {} }
    // leilão (só em Aurora): itens bons que ele não usa
    const ah = reg === 0 ? this.nearestNpc("leilao", 0) : null;
    if (ah) { const j = this.junk(); for (const i of j.auction.slice(0, 2)) { const it = c.inv[i]; if (!it) continue; const price = Math.max(60, Math.round(R.sellPrice(it) * rnd(4, 8))), tag = it.name + "|" + it.ilvl;
      this.task(ah, () => { const k = (this.c.inv || []).findIndex((s: any) => s && s.k === "eq" && s.name + "|" + s.ilvl === tag); if (k >= 0) this.send("ah", { op: "sell", i: k, price, qty: 1 }); }, "leilão"); } }
    this.log("cidade:", this.tasks.map((t) => t.why).join(", "));
  }
  gemFits(gid: string) { const g = R.GEMD[gid]; if (!g) return false; const mag = ["mago", "pierrot"].includes(this.c.cls); if (g.k === "ampE") return !mag; if (g.k === "ampM") return mag; return true; }

  /* ---------- caça ---------- */
  loot(now: number) {
    if (this.tgt && this.tgt.alive && hyp(this.tgt, this.pos) < 8) return;
    let best: any = null, bd = 14;
    for (const d of this.drops.values()) { if (now < d.free) continue; const dist = hyp(d, this.pos); if (dist < bd && (d.item.k === "gold" || R.canAdd(this.c.inv, d.item))) { bd = dist; best = d; } }
    if (!best) return;
    this.lastPick = now;
    if (bd <= 5) this.send("pick", { id: best.id }); else { this.tgt = null; this.go(best.x, best.z, 2); }
  }
  foeOk(m: Mon) { return m.alive && (m.inst || 0) === 0 && !(R.MT[m.type] && R.MT[m.type].boss) && m.lvl <= this.c.level + 4; }
  hunt(now: number) {
    const z = this.zone; if (!z) { const t = R.WORLD.CITY[0].sp; this.go(t[0], t[1], 3); return; }
    if (this.tgt && (!this.tgt.alive || !this.mons.has(this.tgt.id) || hyp(this.tgt, z) > z.r + 18)) this.tgt = null;
    if (!this.tgt) {
      let b: Mon | null = null, bd = 1e9;
      for (const m of this.mons.values()) { if (!this.foeOk(m) || hyp(m, z) > z.r + 10) continue; const d = hyp(m, this.pos) + (m.hp < m.maxHp ? -4 : 0) + (this.prefT && m.type !== this.prefT ? 25 : 0); if (d < bd) { bd = d; b = m; } }
      this.tgt = b;
    }
    if (!this.tgt) { // anda pela zona procurando
      if (!this.wander || hyp(this.wander, this.pos) < 2) { const a = rnd(0, Math.PI * 2), r = rnd(0, z.r); this.wander = { x: z.x + Math.cos(a) * r, z: z.z + Math.sin(a) * r }; }
      this.go(this.wander.x, this.wander.z, 1.5); return;
    }
    this.fight(now, { x: this.tgt.x, z: this.tgt.z, id: this.tgt.id, pid: "" });
  }
  /* luta contra um alvo (monstro: id • jogador: pid) */
  fight(now: number, T: { x: number; z: number; id: number; pid: string }) {
    const c = this.c, C = R.CLASSES[c.cls], dist = hyp(T, this.pos), d = this.D();
    // habilidade
    if (now > this.skUntil && (c.cls === "assassino" || now > this.actUntil)) {
      const near = [...this.mons.values()].filter((m) => this.foeOk(m) && hyp(m, this.pos) < 6).length;
      let best = -1, bs = 0;
      C.skills.forEach((s0: any, i: number) => {
        const r = (c.sk && c.sk[i]) || 0; if (!r || c.level < s0.lv || now < this.cd[i]) return;
        const s = R.skStat(c.cls, i, r); if (this.mp < s.mp) return;
        let sc = 0;
        if (s.type === "heal") sc = this.hp < d.maxHp * 0.55 ? 9 : 0;
        else if (SELFBUFF.includes(s.type)) sc = now > this.buffUntil[i] && dist < 9 ? 4 : 0;
        else if (s.type === "aoeSelf" || s.type === "aoeMulti") sc = dist <= (s.radius || 3) * 0.9 ? 2 + Math.min(4, near) * 1.5 : 0;
        else if (TARGETED.includes(s.type) || DIRECTED.includes(s.type) || s.type === "hexStar" || s.type === "bomb" || s.type === "starJump") sc = dist <= (s.range || 3) - 0.3 ? 2 + (s.mult || 1) : 0;
        if (T.pid && ["chainPull", "starJump", "aoeMulti"].includes(s.type)) sc = 0;
        if (sc > bs) { bs = sc; best = i; }
      });
      if (best >= 0 && Math.random() < 0.85) return this.cast(best, T, now, dist);
    }
    // ataque básico
    const range = C.range - 0.4;
    if (dist > range) { this.go(T.x, T.z, Math.max(1, range - 0.4)); return; }
    if (now >= this.nextAtk && (c.cls === "assassino" || now > this.actUntil)) {
      this.send("atk", T.pid ? { pid: T.pid } : { tid: T.id });
      this.nextAtk = now + (900 / (d.atkSpd || 1)) * rnd(1.02, 1.15); this.actUntil = now + 260; this.lastCombat = now;
    }
  }
  cast(i: number, T: { x: number; z: number; id: number; pid: string }, now: number, dist: number) {
    const c = this.c, s = R.skStat(c.cls, i, c.sk[i]); const dx = T.x - this.pos.x, dz = T.z - this.pos.z;
    const m: any = { i, tid: T.pid ? 0 : T.id, dx, dz, tids: [] as number[] };
    if (T.pid) m.pid = T.pid;
    if (s.type === "hexStar" || s.type === "bomb") { m.cx = T.x; m.cz = T.z; }
    if (s.type === "starJump" || s.type === "chainPull") { const o = s.type === "chainPull" ? T : this.pos; m.tids = [...this.mons.values()].filter((q) => this.foeOk(q) && hyp(q, o) <= (s.type === "chainPull" ? (s.radius || 4) + 2 : (s.range || 8) + 4)).sort((a, b) => hyp(a, o) - hyp(b, o)).slice(0, s.cnt || s.jumps || 5).map((q) => q.id); if (!m.tids.length && !T.pid) return; }
    this.send("cast", m);
    this.mp -= s.mp || 0; this.cd[i] = now + (s.cd || 1) * 1000 + 250; this.lastCombat = now;
    this.actUntil = now + R.animMs(c.cls, i); this.skUntil = now + R.castMs(c.cls, i, { dist, n: m.tids.length, hits: s.hits }) + 120;
    if (SELFBUFF.includes(s.type)) this.buffUntil[i] = now + (s.dur || 10) * 1000;
  }

  /* ---------- PvP: duelo, Arena PK e guerra ---------- */
  foes(): any[] {
    const st = this.room && this.room.state; if (!st) return [];
    const out: any[] = [];
    st.players.forEach((p: any, sid: string) => {
      if (sid === this.sid || p.dead || p.inst) return;
      if (this.pv === "duel" ? sid !== this.foe : this.pv === "arena" ? p.x < 1650 : this.pv === "war" ? !(p.nt && p.nt !== this.c.nat && R.regAt(p.x, p.z) === -900) : true) return;
      out.push({ x: p.x, z: p.z, id: 0, pid: sid });
    });
    return out;
  }
  pvpTick(now: number) {
    if (now < this.pvAt) return;                          // contagem / proteção
    if (this.pv === "arena" && now > this.arenaUntil) { if (now - this.recallAt > 3000) { this.recallAt = now; this.send("arena", { op: "leave" }); } return; }
    if (this.pv === "war" && now > this.nextWar + 10 * 60_000) { this.pv = ""; this.mode = "hunt"; return; }
    const F = this.foes(); let b: any = null, bd = this.pv === "war" ? 26 : 80;
    for (const f of F) { const d = hyp(f, this.pos); if (d < bd) { bd = d; b = f; } }
    if (b) { this.fight(now, b); return; }
    if (this.pv === "war") { this.zone = this.zone && this.zone.reg === -900 ? this.zone : this.pickZone(-900); this.hunt(now); return; }   // sem inimigos por perto: caça na cidade das máquinas
    if (this.pv === "arena") { const A = R.ARENA; if (!this.wander || hyp(this.wander, this.pos) < 2) { const a = rnd(0, 6.28), r = rnd(0, A.r * 0.7); this.wander = { x: A.x + Math.cos(a) * r, z: A.z + Math.sin(a) * r }; } this.go(this.wander.x, this.wander.z, 1.5); }
  }
}

type Plan = { c: string; i: number; at: number };   // classe, posição (nação), hora de entrada — sai em at + 2 h
class Squad {
  bots: Bot[] = []; until = Date.now() + LIFE_MS; stopped = false; pend = 0; nextAt = 0; timers: NodeJS.Timeout[] = []; plan: Plan[] = []; idx = 0;
  constructor(public mgr: BotManager, public gmChar: string, public gmName: string) {}
  lost(b: Bot) { this.bots = this.bots.filter((x) => x !== b); if (!this.bots.length && !this.pend) this.stop("sem bots"); else this.save(); }
  /** v2.6.4: guarda o esquadrão no banco — se o servidor cair/atualizar, os bots voltam sozinhos quando ele subir */
  save() { if (this.stopped) return; pool.query("insert into bot_squads(gm,data,at) values($1,$2,now()) on conflict(gm) do update set data=excluded.data, at=now()", [this.gmChar, JSON.stringify({ name: this.gmName, idx: this.idx, plan: this.plan })]).catch(() => {}); }
  stop(why: string) { if (this.stopped) return; this.stopped = true; pool.query("delete from bot_squads where gm=$1", [this.gmChar]).catch(() => {}); for (const t of this.timers) clearTimeout(t); this.timers = []; this.pend = 0; for (const b of this.bots) b.stop(); this.bots = []; this.mgr.squads.delete(this.gmChar); console.log(`[bots] esquadrão de ${this.gmName} retirado (${why})`); }
}

/* contas dos bots: uma por (personagem GM, classe) — ficam no banco e o bot continua evoluindo nas próximas vezes */
async function ensureBot(gmChar: string, cls: string, slot: number, sqIdx: number): Promise<{ acc: { id: number; username: string }; charId: string }> {
  const username = `#bot_${gmChar}_${cls}`;
  let r = await pool.query("select id,username from accounts where username=$1", [username]);
  if (!r.rows[0]) { await pool.query("insert into accounts(username,pass_hash) values($1,$2) on conflict do nothing", [username, bcrypt.hashSync(crypto.randomBytes(24).toString("hex"), 8)]); r = await pool.query("select id,username from accounts where username=$1", [username]); }
  const acc = r.rows[0];
  const ch = await pool.query("select id,name,data from characters where account_id=$1 limit 1", [acc.id]);
  const freeName = async (start: number): Promise<[string, number] | null> => {
    for (let tries = 0; tries < NAMES.length + 10; tries++) {
      const [base, fem] = NAMES[(start + tries) % NAMES.length], name = tries < NAMES.length ? base : base.split(" ")[0] + " " + ["II", "III", "do Norte", "do Sul", "Jr"][tries % 5];
      if (BANNED.has(name.toLowerCase())) continue;
      const taken = await pool.query("select 1 from characters where lower(name)=lower($1) limit 1", [name]); if (!taken.rowCount) return [name, fem];
    }
    return null;
  };
  if (ch.rows[0]) {
    if (BANNED.has(String(ch.rows[0].name || "").toLowerCase()) || !NAMES.some(([n]) => String(ch.rows[0].name || "").toLowerCase().startsWith(n.toLowerCase()))) {   // renomeia (mantém nível, itens e tudo mais)
      const c0 = R.migrate(ch.rows[0].data || {}), nf = await freeName(Math.floor(Math.random() * NAMES.length));
      if (nf) { const [nm, f] = nf; c0.name = nm; if (!!c0.fem !== !!f) { c0.fem = f; c0.lk = R.lkFix(c0.lk, f) || c0.lk; } await saveChar(acc.id, c0); }
    }
    return { acc, charId: ch.rows[0].id };
  }
  let k = (sqIdx * 6 + slot * 7 + Math.floor(Math.random() * 3)) % NAMES.length, c: any = null;
  for (let tries = 0; tries < NAMES.length + 10; tries++) {
    const [base, fem] = NAMES[(k + tries) % NAMES.length], name = tries < NAMES.length ? base : base.split(" ")[0] + " " + ["II", "III", "do Norte", "do Sul", "Jr"][tries % 5];
    if (BANNED.has(name.toLowerCase())) continue;
    const taken = await pool.query("select 1 from characters where lower(name)=lower($1) limit 1", [name]); if (taken.rowCount) continue;
    const lk = R.lkFix("n" + [9, 9, 6].map((m) => Math.floor(Math.random() * m)).join("") + String(Math.floor(Math.random() * 24)).padStart(2, "0") + [6, 4, 8].map((m) => Math.floor(Math.random() * m)).join(""), fem);
    c = R.newChar(cls, name, fem, lk); c.nmOk = 1; break;
  }
  if (!c) throw new Error("sem nome livre");
  await saveChar(acc.id, c);
  return { acc, charId: c.id };
}

export class BotManager {
  port = 0; squads = new Map<string, Squad>();
  status(gmChar: string) { const q = this.squads.get(gmChar); let total = 0; for (const s of this.squads.values()) total += s.bots.length; return { on: q ? 1 : 0, n: q ? q.bots.length : 0, pend: q ? q.pend : 0, next: q && q.pend ? Math.max(0, q.nextAt - Date.now()) : 0, left: q ? Math.max(0, q.until - Date.now()) : 0, total, squads: this.squads.size, max: MAX_SQUADS * 6, names: q ? q.bots.map((b) => (b.c ? `${b.c.name} (${b.c.cls}, Nv ${b.c.level}${b.c.nat ? ", " + R.NATIONS[b.c.nat].n : ""})` : "...")) : [] }; }
  /** entra um bot do plano; o bot sai sozinho em at + 2 h */
  private async join(sq: Squad, p: Plan): Promise<boolean> {
    if (sq.stopped) return false;
    try {
      const { acc, charId } = await ensureBot(sq.gmChar, p.c, p.i, sq.idx); if (sq.stopped) return false;
      const b = new Bot(sq, acc, charId, p.i, (p.i % 2) + 1);   // 3 bots em cada nação
      await b.start(this.port); if (sq.stopped) { b.stop(); return false; }
      b.until = p.at + LIFE_MS; sq.bots.push(b); return true;
    } catch (e: any) { console.error("[bots] falhou", p.c, e && e.message); return false; }
  }
  /** agenda os que ainda vão entrar (e põe na hora os atrasados) */
  private schedule(sq: Squad, list: Plan[]) {
    const now = Date.now(); sq.pend = list.length; sq.nextAt = list.length ? Math.max(now, list[0].at) : 0;
    sq.until = Math.max(now, ...sq.plan.map((p) => p.at)) + LIFE_MS;
    list.forEach((p, k) => sq.timers.push(setTimeout(async () => {
      if (sq.stopped) return; const ok = await this.join(sq, p); if (!ok) p.at = 0;   // não conseguiu: não tenta de novo depois
      sq.pend = Math.max(0, sq.pend - 1); sq.nextAt = list[k + 1] ? Math.max(Date.now(), list[k + 1].at) : 0; sq.save();
      if (!sq.bots.length && !sq.pend) sq.stop("sem bots");
    }, Math.max(0, p.at - now) + k * 2500 * (p.at <= now ? 1 : 0))));
  }
  async launch(gmChar: string, gmName: string): Promise<string> {
    if (!this.port) return "🤖 O servidor ainda está iniciando.";
    if (this.squads.has(gmChar)) return "🤖 Seus bots já estão no jogo.";
    if (this.squads.size >= MAX_SQUADS) return `🤖 Limite de ${MAX_SQUADS * 6} bots no jogo (${MAX_SQUADS} GMs).`;
    const sq = new Squad(this, gmChar, gmName); this.squads.set(gmChar, sq);
    sq.idx = [...this.squads.keys()].indexOf(gmChar);
    // ordem embaralhada e um bot a cada 5 minutos (não fazem tudo ao mesmo tempo)
    const now = Date.now(), cls = ACTIVE().slice(0, 6);
    sq.plan = cls.map((c, i) => ({ c, i, at: 0 })).sort(() => Math.random() - 0.5).map((p, k) => ({ ...p, at: now + k * GAP_MS }));
    if (!(await this.join(sq, sq.plan[0]))) { sq.stop("falha"); return "🤖 Não foi possível lançar os bots agora."; }
    this.schedule(sq, sq.plan.slice(1)); sq.save();
    console.log(`[bots] ${gmName} lançou os bots (1 agora, ${sq.plan.length - 1} a cada ${GAP_MS / 60000} min)`);
    return `🤖 O primeiro bot entrou. Os outros ${sq.plan.length - 1} entram um a cada 5 minutos. Cada um sai sozinho 2 horas depois de entrar (ou todos quando você retirar).`;
  }
  /** v2.6.4: o servidor voltou (atualização/queda) — recoloca os esquadrões que estavam no jogo, cada bot com o tempo que ainda tinha */
  async restore() {
    let rows: any[] = []; try { rows = (await pool.query("select gm,data from bot_squads")).rows; } catch { return; }
    for (const r of rows) {
      const d = r.data || {}, now = Date.now(), plan: Plan[] = (d.plan || []).filter((p: Plan) => p && p.at > 0 && p.at + LIFE_MS > now);
      if (!plan.length || this.squads.has(r.gm) || this.squads.size >= MAX_SQUADS) { if (!plan.length) pool.query("delete from bot_squads where gm=$1", [r.gm]).catch(() => {}); continue; }
      const sq = new Squad(this, r.gm, d.name || "GM"); sq.idx = d.idx || 0; sq.plan = plan; this.squads.set(r.gm, sq);
      const inGame = plan.filter((p) => p.at <= now), later = plan.filter((p) => p.at > now);
      let ok = 0; for (const p of inGame) { if (await this.join(sq, p)) ok++; await new Promise((res) => setTimeout(res, rnd(1500, 3500))); }
      this.schedule(sq, later); sq.save();
      if (!ok && !later.length) sq.stop("sem bots");
      console.log(`[bots] esquadrão de ${sq.gmName} voltou: ${ok} no jogo, ${later.length} a caminho`);
    }
  }
  stop(gmChar: string, why = "GM") { const q = this.squads.get(gmChar); if (q) q.stop(why); }
  /** v2.6.3: de qual GM é o bot (nome do GM) */
  ownerOf(charId: string) { for (const q of this.squads.values()) if (q.bots.some((b) => b.charId === charId)) return q.gmName; return ""; }
  stopAll() { for (const q of [...this.squads.values()]) q.stop("servidor"); }
}
export const BOTS = new BotManager();
