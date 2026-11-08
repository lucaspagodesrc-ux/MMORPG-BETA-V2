// Simulação dos monstros no servidor: movimento, perseguição, ataques, vida e renascimento.
// Os dados (tipos, zonas, vida, ataque…) vêm de rules.js — os mesmos que o navegador usa para desenhar.
import { Monster, WorldState } from "./schema";
const R: any = require("./rules.js");
const MT: Record<string, any> = R.MT, ZONES: any[] = R.ZONES;

const MAP = 80;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ri = (a: number, b: number) => Math.floor(rnd(a, b + 1));
const cxOf = (x: number) => (x > 150 ? 300 : 0);                       // centro da região (Vila Aurora ou Solara)
const clampX = (x: number, ref: number) => Math.max(cxOf(ref) - MAP, Math.min(cxOf(ref) + MAP, x));
const clampZ = (v: number) => Math.max(-MAP, Math.min(MAP, v));
const safe = (x: number, z: number) => R.inTown(x, z);

export type Sim = {
  m: Monster; T: any; zone: any; atk: number; def: number; bs: number;
  sx: number; sz: number; aggro: string | null; returning: boolean;
  atkAt: number; slowUntil: number; slamAt: number; wanderAt: number; wx: number; wz: number; deadAt: number;
  markUntil: number; contrib: Map<string, number>; boss: boolean; lastHitBy: string;
};
export type Hooks = {
  hit: (sessionId: string, dmg: number, monsterId: number) => void;   // monstro acerta um jogador
  attack: (monsterId: number) => void;                                 // animação de ataque (todos veem)
  slam: (x: number, z: number, r: number) => void;                     // aviso do ataque em área do chefe
};

export class MonsterSim {
  list: Sim[] = [];
  byId = new Map<number, Sim>();
  constructor(private state: WorldState, private hooks: Hooks) {
    let id = 0;
    for (const zone of ZONES) for (let i = 0; i < zone.n; i++) {     // mesma ordem do navegador => mesmos ids
      const T = MT[zone.t];
      const m = new Monster();
      m.id = ++id; m.type = zone.t;
      const s: Sim = { m, T, zone, atk: 0, def: 0, bs: T.boss ? 1.6 : 1, sx: 0, sz: 0, aggro: null, returning: false, atkAt: 0, slowUntil: 0, slamAt: 0, wanderAt: 0, wx: 0, wz: 0, deadAt: 0, markUntil: 0, contrib: new Map(), boss: !!T.boss, lastHitBy: '' };
      this.respawn(s, Date.now());
      this.list.push(s); this.byId.set(m.id, s);
      state.monsters.set(String(m.id), m);
    }
  }

  respawn(s: Sim, now: number) {
    const { T, zone, m } = s;
    m.lvl = T.boss ? T.lv[0] : ri(T.lv[0], T.lv[1]);
    const k = m.lvl - T.lv[0];
    m.maxHp = Math.round(T.hp * (1 + k * 0.2)); m.hp = m.maxHp; s.atk = T.atk * (1 + k * 0.14); s.def = T.def * (1 + k * 0.1);
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * zone.r;
    m.x = clampX(zone.x + Math.cos(a) * r, zone.x); m.z = clampZ(zone.z + Math.sin(a) * r);
    s.sx = m.x; s.sz = m.z; s.aggro = null; s.returning = false; s.atkAt = 0; s.slowUntil = 0; s.markUntil = 0; s.slamAt = now + 6000; s.wanderAt = 0;
    s.contrib.clear();
    m.alive = true;
  }

  /** Dano vindo de um jogador. Devolve true se o monstro morreu com este golpe. */
  damage(sessionId: string, s: Sim, dmg: number, slowMs: number): boolean {
    if (!s.m.alive) return false;
    const m = s.m, real = Math.min(dmg, m.hp);
    m.hp = Math.max(0, m.hp - dmg);
    s.contrib.set(sessionId, (s.contrib.get(sessionId) || 0) + real); s.lastHitBy = sessionId;
    if (!s.aggro) { s.aggro = sessionId; s.returning = false; }
    if (slowMs > 0) s.slowUntil = Date.now() + Math.min(slowMs, 6000);
    if (m.hp <= 0) { m.alive = false; s.deadAt = Date.now(); s.aggro = null; return true; }
    return false;
  }

  update(dt: number) {
    const now = Date.now(), players = this.state.players;
    for (const s of this.list) {
      const { m, T } = s;
      if (!m.alive) { if (now - s.deadAt > T.resp * 1000) this.respawn(s, now); continue; }
      let tgt: { id: string; x: number; z: number } | null = null, best = Infinity;
      players.forEach((p, id) => {
        if (p.dead || safe(p.x, p.z) || cxOf(p.x) !== cxOf(m.x)) return;
        const d = Math.hypot(p.x - m.x, p.z - m.z);
        if (d < best) { best = d; tgt = { id, x: p.x, z: p.z }; }
      });
      let cur: { id: string; x: number; z: number } | null = null;
      if (s.aggro) { const p = players.get(s.aggro); if (p && !p.dead && !safe(p.x, p.z) && cxOf(p.x) === cxOf(m.x)) cur = { id: s.aggro, x: p.x, z: p.z }; }
      const dS = Math.hypot(m.x - s.sx, m.z - s.sz);
      if (!s.aggro && !s.returning && tgt && best < T.aggro) { s.aggro = (tgt as any).id; cur = tgt; }
      if (s.aggro && (!cur || dS > T.leash)) { s.aggro = null; s.returning = true; cur = null; }

      let tx: number | null = null, tz: number | null = null, sp = 0, stop = 0.2;
      const sl = now < s.slowUntil ? 0.4 : 1;
      if (s.aggro && cur) {
        const dP = Math.hypot(cur.x - m.x, cur.z - m.z);
        tx = cur.x; tz = cur.z; sp = T.spd * sl; stop = T.rng * 0.85;
        if (dP <= T.rng && now - s.atkAt > T.atkInt) { s.atkAt = now; this.hooks.attack(m.id); this.hooks.hit(s.aggro, s.atk * rnd(0.85, 1.15), m.id); }
        if (s.boss && dP < 12 && now > s.slamAt) {
          s.slamAt = now + 9000; const cx = m.x, cz = m.z;
          this.hooks.slam(cx, cz, 5);
          setTimeout(() => {
            if (!m.alive) return;
            players.forEach((p, id) => { if (!p.dead && !safe(p.x, p.z) && Math.hypot(p.x - cx, p.z - cz) < 5) this.hooks.hit(id, s.atk * 1.8, m.id); });
          }, 1000);
        }
      } else if (s.returning) {
        tx = s.sx; tz = s.sz; sp = T.spd * 1.6; stop = 0.5;
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.2 * dt);
        if (dS < 0.7) s.returning = false;
      } else {
        if (now > s.wanderAt) { s.wx = s.sx + rnd(-3, 3); s.wz = s.sz + rnd(-3, 3); s.wanderAt = now + rnd(2500, 6500); }
        tx = s.wx; tz = s.wz; sp = T.spd * 0.35; stop = 0.3;
      }
      if (tx !== null && tz !== null) {
        const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
        if (d > stop) { const st = Math.min(sp * dt, d - stop); m.x += (dx / d) * st; m.z += (dz / d) * st; m.rot = Math.atan2(dx, dz); }
      }
      for (const tw of R.TOWNS) {                 // monstros não entram nas zonas seguras
        const ex = m.x - tw.x, ez = m.z - tw.z, dc = Math.hypot(ex, ez);
        if (dc < tw.r + 0.6 && dc > 1e-3) { m.x = tw.x + (ex / dc) * (tw.r + 0.6); m.z = tw.z + (ez / dc) * (tw.r + 0.6); }
      }
      m.x = clampX(m.x, s.sx); m.z = clampZ(m.z);
    }
    // separação simples entre monstros próximos
    const L = this.list;
    for (let i = 0; i < L.length; i++) { const a = L[i].m; if (!a.alive) continue;
      for (let j = i + 1; j < L.length; j++) { const b = L[j].m; if (!b.alive) continue;
        const dx = a.x - b.x, dz = a.z - b.z; if (Math.abs(dx) > 1.4 || Math.abs(dz) > 1.4) continue;
        const d = Math.hypot(dx, dz), min = 0.6 * (L[i].bs + L[j].bs);
        if (d < min && d > 1e-3) { const k = (min - d) / 2 / d; a.x += dx * k; a.z += dz * k; b.x -= dx * k; b.z -= dz * k; } } }
  }
}
