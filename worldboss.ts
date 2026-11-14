// Chefes de mundo: nascem em horários fixos numa arena de cada região (Aurora, Solara e Nevasca).
// Todos lutam juntos. A vida do chefe cresce com o poder de quem entra na luta, e o prêmio chega por correio pelo ranking de dano.
// Os dados (horários, mecânicas, relíquias) ficam em rules.js (WBOSS); aqui está só a execução no servidor.
import { pool } from "./db";
import { sendMail, mailNotify } from "./mail";
import type { Sim } from "./monsters";
import { gpAdd } from "./guild";
const R: any = require("./rules.js");

const HPX = Number(process.env.WB_HPX) || 1;          // multiplicador geral da vida (ajuste fino sem mexer no código)
const SECS = Number(process.env.WB_SECS) || 270;      // duração-alvo da luta (s) se todos causarem o dano estimado
const ROT = 2.6;                                       // dano da rotação completa ÷ dano do ataque básico (estimativa)
const ANN = [600, 300, 60, 10];                        // avisos (segundos antes de nascer)
// Só para testes: WB_SHIFT adianta (ou atrasa) o relógio dos chefes, em segundos; WB_SHIFT_FILE lê esse valor de um arquivo (pode mudar com o servidor ligado).
const SHIFT_FILE = process.env.WB_SHIFT_FILE || "";
let shiftMs = (Number(process.env.WB_SHIFT) || 0) * 1000, shiftAt = 0;
export const wbNow = () => {
  const t = Date.now();
  if (SHIFT_FILE && t - shiftAt > 500) { shiftAt = t; try { shiftMs = (Number(require("fs").readFileSync(SHIFT_FILE, "utf8")) || 0) * 1000; } catch { /* mantém o último valor */ } }
  return t + shiftMs;
};
const LATE_MS = 8 * 60_000;                            // servidor ligado tarde: ainda nasce se a janela abriu há menos que isso
const cx = (x: number) => (x < -450 ? -600 : x < -150 ? -300 : x > 450 ? 600 : x > 150 ? 300 : 0);
const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Part = { acc: number; sid: string; name: string; cls: string; lv: number; dmg: number };
type Boss = {
  d: any; s: Sim; live: boolean; slot: number; startedAt: number; endsAt: number; parts: Map<number, Part>; pool: number; floor: number;
  rainAt: number; aggroAt: number; rankAt: number; big: Set<number>; enraged: boolean; done: number; warned: Set<string>; kills: number;
};

export class WorldBosses {
  list: Boss[] = [];
  byMid = new Map<number, Boss>();
  ready = false;
  statusAt = 0;
  constructor(private room: any) {
    for (const d of R.WBOSS) {
      const s: Sim | undefined = room.sim.list.find((x: Sim) => x.T.id === d.id);
      if (!s) continue;
      const b: Boss = { d, s, live: false, slot: 0, startedAt: 0, endsAt: 0, parts: new Map(), pool: 0, floor: 0, rainAt: 0, aggroAt: 0, rankAt: 0, big: new Set(), enraged: false, done: 0, warned: new Set(), kills: 0 };
      this.list.push(b); this.byMid.set(s.m.id, b);
    }
    this.load();
  }

  private async load() {
    try {
      const r = await pool.query("select id,slot,kills from wb_state");
      for (const x of r.rows) { const b = this.list.find((q) => q.d.id === x.id); if (b) { b.done = Number(x.slot) || 0; b.kills = x.kills || 0; } }
    } catch (e) { console.error("[chefes] carregar", e); }
    this.ready = true;
  }
  private save(b: Boss) {
    pool.query("insert into wb_state(id,slot,kills) values($1,$2,$3) on conflict (id) do update set slot=excluded.slot, kills=excluded.kills, updated_at=now()", [b.d.id, b.done, b.kills])
      .catch((e: any) => console.error("[chefes] salvar", e));
  }
  private say(text: string, extra?: any) {
    this.room.broadcast("chat", { kind: "wb", text });
    if (extra) this.room.broadcast("wbmsg", extra);
  }
  snapshot() {
    return { now: wbNow(), list: this.list.map((b) => ({ id: b.d.id, live: b.live ? 1 : 0, endsAt: b.endsAt, hp: Math.round(b.s.m.hp), mhp: Math.round(b.s.m.maxHp), np: b.parts.size, kills: b.kills })) };
  }
  status() { this.room.broadcast("wbs", this.snapshot()); }

  /* ---------- relógio: avisos, nascimento e mecânicas ---------- */
  tick(now: number) {
    if (!this.ready) return;
    if (Math.abs(now - this.statusAt) >= 30_000) { this.statusAt = now; this.status(); }       // a cada 30 s: situação dos chefes (reajusta o relógio dos clientes)
    for (const b of this.list) {
      const d = b.d;
      if (b.live) { this.liveTick(b, now); continue; }
      const cur = R.wbCur(d, now);
      if (cur && b.done < cur) {                                       // janela aberta e ainda não atendida
        if (now - cur <= LATE_MS) this.spawn(b, cur, now, false);
        else { b.done = cur; this.save(b); }                           // servidor estava desligado: pula esta janela
        continue;
      }
      const nx = R.wbNext(d, now), left = nx - now;
      if (nx) for (const t of ANN) {
        const key = nx + ":" + t;
        if (left <= t * 1000 && left > t * 1000 - 20_000 && !b.warned.has(key)) {
          b.warned.add(key); if (b.warned.size > 40) b.warned.clear();
          const when = t >= 60 ? `${t / 60} minuto${t > 60 ? "s" : ""}` : `${t} segundos`;
          this.say(`☠️ ${d.name} desperta em ${when} — ${d.place}. Reúnam-se na arena! (Nv ${d.minLv}+)`, { k: "warn", id: d.id, t, at: nx });
        }
      }
    }
  }

  /** GM: faz o chefe nascer agora (teste ou evento especial). */
  force(id: string): boolean {
    const b = this.list.find((q) => q.d.id === id); if (!b || b.live) return false;
    const now = wbNow(), cur = R.wbCur(b.d, now);
    if (cur) { b.done = Math.max(b.done, cur); this.save(b); }       // não deixa o horário normal nascer outro em seguida
    this.spawn(b, now, now, true); return true;
  }

  private spawn(b: Boss, slot: number, now: number, forced: boolean) {
    const d = b.d, s = b.s, m = s.m, T = s.T;
    this.room.sim.respawn(s, Date.now());                                                    // o simulador de monstros usa o relógio real
    const life = (Number(process.env.WB_LIFE) || d.life) * 60_000;                          // WB_LIFE (minutos) só para testes
    b.live = true; b.slot = slot; b.startedAt = now; b.endsAt = forced ? now + life : Math.max(slot + life, now + Math.min(life, 10 * 60_000));
    b.parts.clear(); b.pool = 0; b.big.clear(); b.enraged = false;
    b.floor = Math.round(T.hp * HPX); m.lvl = d.lv; m.maxHp = b.floor; m.hp = b.floor; s.atk = T.atk; s.def = T.def; s.noResp = true;
    s.contrib.clear(); s.aggro = null; s.returning = false; s.slamAt = Date.now() + 14_000;
    b.rainAt = now + 12_000; b.aggroAt = now + 15_000; b.rankAt = now + 2000;
    m.alive = true;
    if (!forced) { b.done = slot; this.save(b); }
    this.say(`☠️ ${d.name} surgiu! ${d.intro} Todos à arena (${d.place}) — ${Math.max(1, Math.round((b.endsAt - now) / 60_000))} minutos para derrotá-lo!`, { k: "spawn", id: d.id, endsAt: b.endsAt });
    this.status();
  }

  private liveTick(b: Boss, now: number) {
    const s = b.s, m = s.m, d = b.d, mech = d.mech;
    if (!m.alive) { b.live = false; return; }
    if (now >= b.endsAt) return this.despawn(b);
    const near: [string, any][] = [];
    this.room.state.players.forEach((p: any, id: string) => { if (!p.dead && !p.inst && cx(p.x) === d.reg && Math.hypot(p.x - m.x, p.z - m.z) < 70) near.push([id, p]); });
    if (now >= b.aggroAt) {                                           // a cada 14 s o chefe troca de alvo: ninguém fica parado batendo no mesmo tanque
      b.aggroAt = now + 14_000;
      const c = near.filter(([, p]) => Math.hypot(p.x - m.x, p.z - m.z) < 16);
      if (c.length > 1) { s.aggro = pick(c)[0]; s.returning = false; }
    }
    const frac = m.hp / Math.max(1, m.maxHp);
    if (!b.enraged && mech.enrage && frac <= mech.enrage) {
      b.enraged = true; s.atk *= 1.35;
      this.say(`🔥 ${d.name} entrou em FÚRIA! Ele agora causa muito mais dano!`, { k: "enrage", id: d.id });
    }
    for (const at of mech.big.at) {
      if (frac <= at && !b.big.has(at)) {
        b.big.add(at); this.room.sim.areaHit(s, m.x, m.z, mech.big.r, mech.big.mult, mech.big.delay, mech.big.c);
        this.say(`⚠️ ${mech.big.name}! Saiam de perto do chefe!`, { k: "big", id: d.id, name: mech.big.name, t: mech.big.delay });
      }
    }
    if (now >= b.rainAt && near.length) {
      const rn = mech.rain; b.rainAt = now + rn.every;
      const n = Math.min(14, rn.n + Math.floor(near.length / rn.per));
      const sel = near.slice().sort(() => Math.random() - .5).slice(0, n);
      for (const [, p] of sel) this.room.sim.areaHit(s, p.x, p.z, rn.r, rn.mult, rn.delay, rn.c);
    }
    if (now >= b.rankAt) { b.rankAt = now + 2000; this.pushRank(b, near); }
  }

  /** ranking de dano: top 5 para todos que estão perto + posição de cada participante */
  private pushRank(b: Boss, near: [string, any][]) {
    const all = [...b.parts.values()].sort((a, c) => c.dmg - a.dmg), total = all.reduce((a, p) => a + p.dmg, 0);
    const top = all.slice(0, 5).map((p) => [p.name, Math.round(p.dmg), p.cls]);
    const rank = new Map<string, [number, number]>(); all.forEach((p, i) => rank.set(p.sid, [i + 1, Math.round(p.dmg)]));
    const base = { id: b.d.id, top, n: all.length, total: Math.round(total), left: Math.max(0, Math.round((b.endsAt - wbNow()) / 1000)) };
    for (const [sid] of near) this.room.sess.get(sid)?.client.send("wbr", { ...base, me: rank.get(sid) || null });
  }

  /* ---------- dano recebido: ranking e vida dinâmica ---------- */
  hurt(sid: string, s: Sim, real: number) {
    const b = this.byMid.get(s.m.id); if (!b || !b.live || real <= 0) return;
    const se = this.room.sess.get(sid); if (!se) return;
    let p = b.parts.get(se.acc.id);
    if (!p) { p = { acc: se.acc.id, sid, name: se.c.name, cls: se.c.cls, lv: se.c.level, dmg: 0 }; b.parts.set(se.acc.id, p); this.grow(b, this.head(se, s)); }
    p.sid = sid; p.dmg += real;
  }
  /** cota de vida que um jogador acrescenta: o dano que ele causaria em SECS segundos (estimado pelos atributos dele) */
  private head(se: any, s: Sim) {
    const st = this.room.stats(se); let sum = 0;
    for (let i = 0; i < 10; i++) sum += R.hitDamage(st, { mult: 1, basic: true }, { def: s.def, hp: 1, maxHp: 1 }).dmg;
    return Math.max(3000, Math.min(6e6, (sum / 10) * (st.atkSpd / 0.9) * ROT * SECS)) * HPX;
  }
  private grow(b: Boss, head: number) {
    const m = b.s.m, old = Math.max(1, m.maxHp); b.pool += head;
    const nu = Math.round(b.floor + b.pool);
    if (m.hp > 0) m.hp = Math.max(1, Math.round(m.hp * nu / old));       // mantém a mesma % de vida
    m.maxHp = nu;
  }

  /* ---------- fim da luta ---------- */
  killed(s: Sim) {
    const b = this.byMid.get(s.m.id); if (!b || !b.live) return;
    b.live = false; b.kills++; this.save(b);
    const d = b.d, L = d.lv, T = s.T, all = [...b.parts.values()].sort((a, c) => c.dmg - a.dmg);
    const total = all.reduce((a, p) => a + p.dmg, 0) || 1, el = all.filter((p) => p.dmg >= total * 0.004);
    const secs = Math.round((wbNow() - b.startedAt) / 1000);
    const top = el.slice(0, 5).map((p) => [p.name, Math.round(p.dmg), p.cls]);
    this.say(`🏆 ${d.name} foi derrotado em ${mmss(secs)} por ${el.length} herói${el.length === 1 ? "" : "s"}! MVP: ${el[0] ? el[0].name : "—"}. As recompensas foram enviadas ao Correio.`, { k: "win", id: d.id });
    const jobs: Promise<void>[] = [];
    el.forEach((p, i) => jobs.push(this.reward(b, p, i + 1, total, secs)));
    this.room.broadcast("wbend", { id: d.id, win: 1, secs, top, total: Math.round(total), n: el.length });
    Promise.allSettled(jobs).then(() => { b.parts.clear(); this.status(); });
  }

  private async reward(b: Boss, p: Part, rank: number, total: number, secs: number) {
    const d = b.d, L = d.lv, T = b.s.T, top3 = rank <= 3, cls = p.cls;
    const gold = Math.round(R.dwGold(L) * (4 + (rank === 1 ? 8 : rank === 2 ? 6 : rank === 3 ? 4 : rank <= 10 ? 1.5 : 0)) / 100) * 100;
    const items: { item: any; qty: number }[] = [];
    items.push({ item: { k: "pot", id: L >= 75 ? "hp2" : "hp" }, qty: top3 ? 30 : 15 });
    items.push({ item: { k: "pot", id: L >= 75 ? "mp2" : "mp" }, qty: 10 });
    for (const mk of Object.keys(T.mats || {})) items.push({ item: { k: "mat", id: mk }, qty: (mk === "essencia" ? 3 : 2) + (top3 ? 2 : 0) });
    const pool = R.slotPool(cls);
    items.push({ item: R.rollBossAttr(R.genItem(pick(pool), L, top3 ? 3 : Math.max(2, R.rarRoll(2)), cls, cls, 0, d.id), cls), qty: 1 });
    if (top3) items.push({ item: R.rollBossAttr(R.genItem(pick(pool), L, 3, cls, cls, 0, d.id), cls), qty: 1 });
    if (Math.random() < (top3 ? 0.25 : 0.06)) items.push({ item: R.rollScroll(cls, L), qty: 1 });
    let relic: any = null;
    if (Math.random() < 0.012 + (rank === 1 ? 0.02 : rank <= 3 ? 0.01 : 0)) { relic = R.genRelic(cls, L + 1, d.id); items.push({ item: relic, qty: 1 }); }
    try {
      await sendMail(p.acc, {
        kind: "wb", title: `☠️ ${d.name}`.slice(0, 80),
        body: `Você ficou em #${rank} no ranking de dano (${fmt(p.dmg)} de dano, ${Math.round(p.dmg / total * 100)}% do total). Luta de ${mmss(secs)}.${relic ? " ✦ RELÍQUIA anexada!" : ""}`,
        gold, items,
      });
      mailNotify(this.room, p.acc);
    } catch (e) { console.error("[chefes] correio", e); }
    if (relic) this.say(`✦ ${p.name} conquistou a RELÍQUIA ${relic.name} (2 engastes, atributos altíssimos) contra ${d.name}!`, { k: "relic", id: d.id, who: p.name, item: R.nm(relic) });
    const se = this.room.sess.get(p.sid);                              // online: XP na hora, missões diárias/semanais e aviso pessoal
    if (se && se.acc.id === p.acc) {
      const c = se.c, out: any[] = [];
      const xp = Math.max(1, Math.round(R.xpFor(T, L, c.level) * (top3 ? 1.5 : 1)));
      c.kills = (c.kills || 0) + 1;
      out.push({ log: `<span style="color:#ffd27a">☠️ ${d.name} derrotado! +${fmt(xp)} XP • #${rank} no ranking (${fmt(p.dmg)} de dano). Prêmios no Correio 📬</span>` });
      if (R.gainXp(c, xp)) { out.push({ lvl: c.level }); const pl = this.room.state.players.get(p.sid); if (pl) pl.level = c.level; }
      out.push(...R.dwEv(c, "kill", { x: b.s.m.x, boss: true, lvl: b.s.m.lvl }), ...R.dwEv(c, "wb"));
      gpAdd(se, R.GP.wb);                                                 // Pontos de Guilda
      this.room.touch(se); this.room.sync(se); this.room.res(se, out);
      se.client.send("wbmy", { id: d.id, rank, dmg: Math.round(p.dmg), gold, relic: relic ? R.nm(relic) : "" });
    }
  }

  /** passou o tempo: o chefe some; quem lutou ganha um prêmio de consolação */
  private despawn(b: Boss) {
    const d = b.d, m = b.s.m; b.live = false; m.alive = false; b.s.aggro = null; b.s.noResp = true;
    const all = [...b.parts.values()], total = all.reduce((a, p) => a + p.dmg, 0) || 1, el = all.filter((p) => p.dmg >= total * 0.004);
    this.say(`💨 ${d.name} se retirou para as sombras... ninguém conseguiu derrotá-lo a tempo. Quem lutou recebeu um prêmio de consolação no Correio.`, { k: "lose", id: d.id });
    for (const p of el) {
      sendMail(p.acc, { kind: "wb", title: `☠️ ${d.name} escapou`.slice(0, 80), body: "O chefe não foi derrotado a tempo. Eis um prêmio de consolação pela coragem.", gold: Math.round(R.dwGold(d.lv) * 1.2 / 100) * 100, items: [{ item: { k: "pot", id: d.lv >= 75 ? "hp2" : "hp" }, qty: 10 }] })
        .then(() => mailNotify(this.room, p.acc)).catch((e: any) => console.error("[chefes] consolo", e));
    }
    this.room.broadcast("wbend", { id: d.id, win: 0, top: [], total: 0, n: el.length, secs: 0 });
    b.parts.clear(); this.status();
  }
}
