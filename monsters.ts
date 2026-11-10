// Simulação dos monstros no servidor: movimento, perseguição, ataques, vida e renascimento.
// Os dados (tipos, zonas, vida, ataque…) vêm de rules.js — os mesmos que o navegador usa para desenhar.
import { Monster, WorldState } from "./schema";
const R: any = require("./rules.js");
const MT: Record<string, any> = R.MT, ZONES: any[] = R.ZONES;

const MAP = 80;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ri = (a: number, b: number) => Math.floor(rnd(a, b + 1));
const cxOf = (x: number) => (x > 450 ? 600 : x > 150 ? 300 : 0);          // centro da região (Vila Aurora, Solara ou dungeon)
const clampX = (x: number, ref: number) => { const c = cxOf(ref), w = c === 600 ? 12 : MAP; return Math.max(c - w, Math.min(c + w, x)); };
const clampZ = (v: number) => Math.max(-MAP, Math.min(MAP, v));
const safe = (x: number, z: number) => R.inTown(x, z);

export type Sim = {
  m: Monster; T: any; zone: any; atk: number; def: number; bs: number;
  sx: number; sz: number; aggro: string | null; returning: boolean;
  atkAt: number; slowUntil: number; stunUntil: number; rootUntil: number; liftUntil: number; tauntUntil: number; slamAt: number; wanderAt: number; wx: number; wz: number; deadAt: number;
  markUntil: number; slot?: number; lastDmgAt?: number; contrib: Map<string, number>; boss: boolean; lastHitBy: string;
  inst: number; noResp: boolean; tier: number;   // instância de dungeon (0 = mundo), sem renascimento, nível do baú
};
export type Hooks = {
  hit: (sessionId: string, dmg: number, monsterId: number) => void;   // monstro acerta um jogador
  attack: (monsterId: number) => void;                                 // animação de ataque (todos veem)
  slam: (x: number, z: number, r: number, inst: number) => void;                     // aviso do ataque em área do chefe
};

export class MonsterSim {
  frozen = new Set<number>();                            // instâncias de dungeon pausadas
  hidden = new Map<string, number>();                    // jogadores invisíveis (Manto Fumaça): sessionId → até quando
  list: Sim[] = [];
  byId = new Map<number, Sim>();
  constructor(private state: WorldState, private hooks: Hooks) {
    let id = 0;
    for (const zone of ZONES) for (let i = 0; i < zone.n; i++) {     // mesma ordem do navegador => mesmos ids
      const T = MT[zone.t];
      const m = new Monster();
      m.id = ++id; m.type = zone.t;
      const s: Sim = { m, T, zone, atk: 0, def: 0, bs: T.boss ? 1.6 : 1, sx: 0, sz: 0, aggro: null, returning: false, atkAt: 0, slowUntil: 0, stunUntil: 0, rootUntil: 0, liftUntil: 0, tauntUntil: 0, slamAt: 0, wanderAt: 0, wx: 0, wz: 0, deadAt: 0, markUntil: 0, contrib: new Map(), boss: !!T.boss, lastHitBy: '', inst: 0, noResp: false, tier: 0 };
      s.slot = i;
      this.respawn(s, Date.now());
      this.list.push(s); this.byId.set(m.id, s);
      state.monsters.set(String(m.id), m);
    }
  }

  /** Cria um monstro dentro de uma instância de dungeon. O id é inst*200+slot (único e previsível pelo cliente). */
  addDynamic(type: string, x: number, z: number, inst: number, slot: number, hidden = false, tier = 0): Sim {
    const T = MT[type], m = new Monster();
    m.id = inst * 200 + slot; m.type = type; m.inst = inst;
    const s: Sim = { m, T, zone: { x, z, r: 0 }, atk: 0, def: 0, bs: T.boss ? 1.6 : 1, sx: x, sz: z, aggro: null, returning: false, atkAt: 0, slowUntil: 0, stunUntil: 0, rootUntil: 0, liftUntil: 0, tauntUntil: 0, slamAt: Date.now() + 6000, wanderAt: 0, wx: x, wz: z, deadAt: 0, markUntil: 0, contrib: new Map(), boss: !!T.boss, lastHitBy: '', inst, noResp: true, tier };
    m.lvl = ri(T.lv[0], T.lv[1]); const k = m.lvl - T.lv[0];
    m.maxHp = Math.max(5, Math.round(T.hp * (1 + k * 0.2) * (Number(process.env.DG_HPX) || 1))); m.hp = m.maxHp; s.atk = T.atk * (1 + k * 0.14); s.def = T.def * (1 + k * 0.1);
    m.x = x; m.z = z; m.rot = 0; m.alive = !hidden;
    this.list.push(s); this.byId.set(m.id, s); this.state.monsters.set(String(m.id), m);
    return s;
  }
  /** Chamado quando o baú aparece (chefe morreu). */
  reveal(s: Sim) { s.m.hp = s.m.maxHp; s.m.alive = true; s.contrib.clear(); }
  removeInst(inst: number) {
    this.list = this.list.filter((s) => { if (s.inst !== inst) return true; this.byId.delete(s.m.id); this.state.monsters.delete(String(s.m.id)); return false; });
  }

  respawn(s: Sim, now: number) {
    const { T, zone, m } = s;
    m.lvl = T.boss ? T.lv[0] : ri(T.lv[0], T.lv[1]);
    const k = m.lvl - T.lv[0];
    m.maxHp = Math.round(T.hp * (1 + k * 0.2)); m.hp = m.maxHp; s.atk = T.atk * (1 + k * 0.14); s.def = T.def * (1 + k * 0.1);
    if (zone.grid) {                                    // campo de treino: espantalhos em grade 3x3, virados para a cidade
      const i = s.slot || 0; m.x = zone.x + ((i % 3) - 1) * zone.grid; m.z = zone.z + (Math.floor(i / 3) - 1) * zone.grid; m.rot = Math.PI; m.lvl = 1;
    } else {
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * zone.r;
      m.x = clampX(zone.x + Math.cos(a) * r, zone.x); m.z = clampZ(zone.z + Math.sin(a) * r);
    }
    s.sx = m.x; s.sz = m.z; s.aggro = null; s.returning = false; s.atkAt = 0; s.slowUntil = 0; s.stunUntil = s.rootUntil = s.liftUntil = s.tauntUntil = 0; m.st = 0; s.markUntil = 0; s.slamAt = now + 6000; s.wanderAt = 0;
    s.contrib.clear();
    m.alive = true;
  }

  /** Dano vindo de um jogador. Devolve true se o monstro morreu com este golpe. */
  damage(sessionId: string, s: Sim, dmg: number, slowMs: number): boolean {
    if (!s.m.alive) return false;
    s.lastDmgAt = Date.now();
    const m = s.m, real = Math.min(dmg, m.hp);
    m.hp = Math.max(0, m.hp - dmg);
    s.contrib.set(sessionId, (s.contrib.get(sessionId) || 0) + real); s.lastHitBy = sessionId;
    if (!s.aggro) { s.aggro = sessionId; s.returning = false; }
    if (slowMs > 0) s.slowUntil = Date.now() + Math.min(slowMs, 6000);
    if (m.hp <= 0) { m.alive = false; m.st = 0; s.deadAt = Date.now(); s.aggro = null; return true; }
    return false;
  }

  /** Controle de grupo: atordoar, imobilizar, levantar e puxar. Chefes resistem (35% do tempo, sem puxar/levantar). */
  cc(s: Sim, o: any, px: number, pz: number) {
    if (!s.m.alive || s.T.chest || s.T.dummy) return;
    if (o.lift && Math.random() < (s.T.eva || 0)) return;          // esquiva alta: escapa de ser lançado/atordoado
    const now = Date.now(), f = s.boss ? 0.35 : 1;
    if (o.stun) s.stunUntil = Math.max(s.stunUntil, now + o.stun * f);
    if (o.root) s.rootUntil = Math.max(s.rootUntil, now + o.root * f);
    if (o.lift && !s.boss) s.liftUntil = Math.max(s.liftUntil, now + o.lift);
    if (o.pull && !s.boss) { const dx = px - s.m.x, dz = pz - s.m.z, d = Math.hypot(dx, dz) || 1; if (d > 2) { s.m.x += (dx / d) * (d - 2); s.m.z += (dz / d) * (d - 2); } }
  }
  /** Provocar: o monstro passa a focar este jogador. */
  taunt(s: Sim, sid: string, ms: number) {
    if (!s.m.alive || s.T.chest) return;
    s.aggro = sid; s.returning = false; s.tauntUntil = Date.now() + ms;
  }

  update(dt: number) {
    const now = Date.now(), players = this.state.players;
    for (const s of this.list) {
      const { m, T } = s;
      if (s.inst && this.frozen.has(s.inst)) continue;
      if (!m.alive) { if (!s.noResp && now - s.deadAt > T.resp * 1000) this.respawn(s, now); continue; }
      if (T.chest) continue;                    // baús não se movem nem atacam
      if (T.dummy) {                            // espantalho: parado, regenera rápido depois de 1s sem apanhar
        if (m.hp < m.maxHp && now - (s.lastDmgAt || 0) > 1000) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.05 * dt);
        continue;
      }
      const lifted = now < s.liftUntil, stunned = lifted || now < s.stunUntil, rooted = now < s.rootUntil;
      const fl = (stunned ? 1 : 0) | (rooted ? 2 : 0) | (lifted ? 4 : 0); if (m.st !== fl) m.st = fl;
      if (stunned) continue;                    // atordoado/levantado: não anda nem ataca
      let tgt: { id: string; x: number; z: number } | null = null, best = Infinity;
      players.forEach((p, id) => {
        if (p.dead || p.inst !== s.inst || safe(p.x, p.z) || cxOf(p.x) !== cxOf(m.x)) return;
        if ((this.hidden.get(id) || 0) > now) return;
        const d = Math.hypot(p.x - m.x, p.z - m.z);
        if (d < best) { best = d; tgt = { id, x: p.x, z: p.z }; }
      });
      let cur: { id: string; x: number; z: number } | null = null;
      if (s.aggro) { const p = players.get(s.aggro); if (p && !p.dead && p.inst === s.inst && !safe(p.x, p.z) && cxOf(p.x) === cxOf(m.x) && !((this.hidden.get(s.aggro) || 0) > now)) cur = { id: s.aggro, x: p.x, z: p.z }; }
      const dS = Math.hypot(m.x - s.sx, m.z - s.sz);
      if (!s.aggro && !s.returning && tgt && best < T.aggro) { s.aggro = (tgt as any).id; cur = tgt; }
      if (s.aggro && (!cur || dS > T.leash)) { s.aggro = null; s.returning = true; cur = null; }

      let tx: number | null = null, tz: number | null = null, sp = 0, stop = 0.2;
      const sl = now < s.slowUntil ? 0.4 : 1;
      if (s.aggro && cur) {
        const dP = Math.hypot(cur.x - m.x, cur.z - m.z);
        tx = cur.x; tz = cur.z; sp = rooted ? 0 : T.spd * sl; stop = T.rng * 0.85;
        if (dP <= T.rng && now - s.atkAt > T.atkInt) { s.atkAt = now; this.hooks.attack(m.id); this.hooks.hit(s.aggro, s.atk * rnd(0.85, 1.15), m.id); }
        if (s.boss && dP < 12 && now > s.slamAt) {
          s.slamAt = now + 9000; const cx = m.x, cz = m.z;
          this.hooks.slam(cx, cz, 5, s.inst);
          setTimeout(() => {
            if (!m.alive) return;
            players.forEach((p, id) => { if (!p.dead && p.inst === s.inst && !safe(p.x, p.z) && Math.hypot(p.x - cx, p.z - cz) < 5) this.hooks.hit(id, s.atk * 1.8, m.id); });
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
        if (L[i].inst !== L[j].inst) continue;
        const dx = a.x - b.x, dz = a.z - b.z; if (Math.abs(dx) > 1.4 || Math.abs(dz) > 1.4) continue;
        const d = Math.hypot(dx, dz), min = 0.6 * (L[i].bs + L[j].bs);
        if (d < min && d > 1e-3) { const k = (min - d) / 2 / d; a.x += dx * k; a.z += dz * k; b.x -= dx * k; b.z -= dz * k; } } }
  }
}
