// Instâncias de dungeon: uma por grupo, com etapas, baús destrutíveis, tempo limite e 5 minutos para voltar se sair.
// Dois estilos de mapa: o corredor reto da Cripta (def.gates) e as dungeons de várias salas em grade (def.rooms, ver rules.js).
// Etapas: kill • statue • boss • runes (ordem sorteada) • defend (altar) • waves (ondas) • crystals (âncoras).
// v1.91 (Cidade das Máquinas): lasers (corredor com lasers + terminal) • power (geradores) • levers (alavancas em sincronia) • escort (núcleo no trilho).
// Chefes v1.91: sweep (varredura de lasers girando) e overload (sobrecarga: destruir os condutores antes da explosão).
// Perigos do ambiente por etapa: hz (círculos de aviso) e cold (frio, só as fogueiras protegem). Chefes: mech { rain, big, adds, shield, blink, nova, enrage }.
import { Sim } from "./monsters";
import { gpAdd } from "./guild";
const R: any = require("./rules.js");
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const shuffle = <T,>(a: T[]) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const LAZY_MAX = 189;                                                   // slots 190..199 ficam para os baús

export type Inst = {
  id: number; def: any; endsAt: number; stage: number; cnt: number; talked: boolean; done: boolean; closed: boolean;
  members: Set<string>; emptySince: number; chests: Map<number, Sim>; grp: boolean; paused: number; pausedTotal: number;
  slot: number; lazy: Sim[]; ss: any;                                 // slot livre p/ monstros criados na luta • lista deles • estado da etapa atual
};

export class Dungeons {
  insts = new Map<number, Inst>();
  private seq = 1;
  constructor(private h: any) {}

  entryOf(def: any) { const n = R.NPCS.find((x: any) => x.dungeon === def.id); return { x: n.x, z: n.z - 4 }; }

  /* ---------- criação ---------- */
  private spawnOf(def: any, st: any): { t: string; n: number; z?: number[]; room?: number[]; at?: number[] } | null {
    if (st.spawn) return st.spawn;                                       // Cripta
    if (st.k === "kill" || st.k === "statue") return { t: st.t, n: st.n || st.need, room: st.room };
    if (st.k === "boss") return { t: st.t, n: 1, at: st.at, room: st.room };
    return null;                                                         // runes / defend / waves / crystals criam seus monstros na hora
  }
  private spot(def: any, sp: any): [number, number] {
    if (sp.z) {                                                          // Cripta: corredor reto
      const z = sp.z[0] === sp.z[1] ? sp.z[0] : sp.z[0] + Math.random() * (sp.z[1] - sp.z[0]);
      return [sp.n === 1 ? def.cx : def.cx + (Math.random() * 2 - 1) * 9, z];
    }
    if (sp.n === 1 && sp.at) return [def.cx + sp.at[0], sp.at[1]];
    const r = sp.room;
    return [def.cx + rnd(r[0] + 1.5, r[2] - 1.5), rnd(r[1] + 1.5, r[3] - 1.5)];
  }
  private homeOf(def: any, x: number, z: number) { return def.rooms ? Math.max(0, R.dgCell(def, x - def.cx, z) - 1) : 0; }

  create(def: any): Inst {
    const id = ++this.seq, inst: Inst = { id, def, endsAt: Date.now() + (Number(process.env.DG_TIME) || def.time) * 1000, stage: 0, cnt: 0, talked: false, done: false, closed: false, members: new Set(), emptySince: Date.now(), chests: new Map(), grp: false, paused: 0, pausedTotal: 0, slot: 0, lazy: [], ss: {} };
    let slot = 0;
    for (const st of def.stages) {
      const sp = this.spawnOf(def, st);
      if (sp) for (let i = 0; i < sp.n; i++) {
        let [x, z] = this.spot(def, sp);
        if (def.rooms) for (let tr = 0; tr < 10 && !R.dgWalk(def, 99, x, z, 0.9); tr++) [x, z] = this.spot(def, sp);          // longe das paredes
        const s = this.h.sim.addDynamic(sp.t, x, z, id, slot++);
        if (def.rooms) s.home = this.homeOf(def, x, z);
      }
      if (st.chest) {
        const cxy: [number, number] = st.spawn ? [def.cx, st.spawn.z[0] + 3] : st.at ? [def.cx + st.at[0], st.at[1] + 3] : [def.cx, 0];
        inst.chests.set(st.chest.slot, this.h.sim.addDynamic("dg_chest", cxy[0], cxy[1], id, st.chest.slot, true, st.chest.tier));
      }
    }
    inst.slot = slot;
    this.insts.set(id, inst);
    this.enterStage(inst);
    return inst;
  }

  /** Cria um monstro durante a luta (ondas, aliados do chefe, guardas das runas…). Devolve null se faltar espaço. */
  private spawnLazy(inst: Inst, type: string, x: number, z: number, aggro = true): Sim | null {
    const def = inst.def;
    if (def.rooms && !R.dgWalk(def, inst.stage, x, z, 0.6)) return null;
    while (inst.slot < LAZY_MAX && inst.chests.has(inst.slot)) inst.slot++;
    const slot = inst.slot < LAZY_MAX ? inst.slot++ : this.recycle(inst);   // v2.5.4: acabaram os slots → reaproveita o de um monstro morto
    if (slot < 0) return null;
    const s = this.h.sim.addDynamic(type, x, z, inst.id, slot);
    s.lazy = true; s.home = this.homeOf(def, x, z); inst.lazy.push(s);
    if (aggro) { const who = this.alive(inst); if (who.length) s.aggro = pick(who)[0]; }
    return s;
  }
  /** v2.5.4: slot de um monstro morto há mais de 3 s (o mais antigo). Antes os slots nunca voltavam e as etapas finais ficavam sem monstros. */
  private recycle(inst: Inst): number {
    const now = Date.now(), base = inst.id * 200, chest = new Set(inst.chests.values()); let best: Sim | null = null;
    for (const s of this.h.sim.list as Sim[]) {
      if (s.inst !== inst.id || s.m.alive || chest.has(s)) continue;
      const k = s.m.id - base; if (k < 0 || k >= LAZY_MAX || inst.chests.has(k) || now - (s.deadAt || 0) < 3000) continue;
      if (!best || (s.deadAt || 0) < (best.deadAt || 0)) best = s;
    }
    if (!best) return -1;
    this.h.sim.removeOne(best); inst.lazy = inst.lazy.filter((x) => x !== best);
    for (const ss of this.h.sess.values()) ss.mv?.delete(best.m.id);             // força o cliente a receber o novo monstro completo (tipo pode mudar)
    return best.m.id - base;
  }
  private clearLazy(inst: Inst) { const now = Date.now(); for (const s of inst.lazy) if (s.m.alive) { s.m.alive = false; s.m.hp = 0; s.aggro = null; s.deadAt = now; } inst.lazy = inst.lazy.filter((s) => s.m.alive); }

  maxZ(inst: Inst) { return inst.def.gates ? inst.def.gates[Math.min(inst.stage, inst.def.gates.length - 1)] : 1e9; }

  /** Etapa atual se for dungeon em grade (salas); -1 = corredor da Cripta (regras antigas). */
  gridStage(instId: number): number { const i = this.insts.get(instId); return i && i.def.rooms ? i.stage : -1; }
  /** Monstro pode pisar aqui? (margem = folga até a parede) */
  walk(instId: number, x: number, z: number, margin: number): boolean {
    const i = this.insts.get(instId); return !i || !i.def.rooms ? true : R.dgWalk(i.def, i.stage, x, z, margin);
  }
  /** Monstro de uma sala que ainda está trancada: adormecido (não apanha, não ataca, não é alvo). */
  dormant(sim: Sim): boolean { const i = this.insts.get(sim.inst); return !!(i && i.def.rooms && (sim.home || 0) > i.stage); }
  startOf(def: any) { return { x: def.start.x !== undefined ? def.start.x : def.cx, z: def.start.z }; }
  /** Garante que o jogador está num lugar válido da instância (reconexão, volta do ingresso). */
  place(inst: Inst, p: any) {
    if (inst.def.rooms) { if (!R.dgWalk(inst.def, inst.stage, p.x, p.z, 0.3)) { const s = this.startOf(inst.def); p.x = s.x; p.z = s.z; } }
    else p.z = Math.min(p.z, this.maxZ(inst) - 0.5);
  }
  /** Movimento de jogador na grade: passo a passo (0,5 m), desliza pelas paredes e nunca atravessa uma parede, nem em saltos. */
  clampMove(inst: Inst, ox: number, oz: number, nx: number, nz: number) {
    const d = inst.def, st = inst.stage, ok = (x: number, z: number) => R.dgWalk(d, st, x, z, 0.3);
    if (!ok(ox, oz)) { if (ok(nx, nz)) return { x: nx, z: nz }; const s0 = this.startOf(d); return { x: s0.x, z: s0.z }; }   // posição antiga inválida: resgata
    const dist = Math.hypot(nx - ox, nz - oz), n = Math.max(1, Math.ceil(dist / 0.5)), sx = (nx - ox) / n, sz = (nz - oz) / n;
    let x = ox, z = oz;
    for (let i = 0; i < n; i++) {
      if (ok(x + sx, z + sz)) { x += sx; z += sz; }
      else if (sx && ok(x + sx, z)) x += sx;
      else if (sz && ok(x, z + sz)) z += sz;
      else break;
    }
    return { x, z };
  }

  private alive(inst: Inst): [string, any][] {
    const out: [string, any][] = [];
    for (const sid of inst.members) { const p = this.h.state.players.get(sid); if (p && !p.dead && p.inst === inst.id) out.push([sid, p]); }
    return out;
  }
  private fx(inst: Inst, msg: any) { for (const sid of inst.members) this.h.sess.get(sid)?.client.send("dgmsg", msg); }
  private env(inst: Inst, atk: number): any { return { inst: inst.id, atk, m: { alive: true, id: 0 } }; }   // "atacante" fantasma dos perigos do ambiente
  private refAtk(inst: Inst, st: any) { const T = R.MT[st.t || st.guards?.t || (st.list && st.list[0].t) || (st.waves && st.waves.t[0]) || (st.spawn && st.spawn.t && st.spawn.t[0]) || st.ct]; return (T && T.atk) || 600; }

  /* ---------- etapas ---------- */
  private enterStage(inst: Inst) {
    const def = inst.def, st = def.stages[inst.stage], now = Date.now(); inst.ss = { t0: now, hzAt: now + 5000, coldAt: now + 3000, last: now };
    if (!st) return;
    const ss = inst.ss;
    if (st.k === "runes") { ss.order = shuffle(st.objs); ss.done = []; ss.wrong = 0; }
    else if (st.k === "defend") { ss.acc = 0; ss.waveAt = now + 5000; }
    else if (st.k === "waves") { ss.w = -1; ss.cur = []; ss.nextAt = now + 3500; }
    else if (st.k === "crystals") { ss.spawnAt = now + 7000; ss.crys = st.at.map(([x, z]: number[]) => this.spawnLazy(inst, st.ct, def.cx + x, z, false)).filter(Boolean); ss.broken = 0; }
    else if (st.k === "lasers") { ss.k = 0; ss.rowAt = now + 3000; ss.spawnAt = now + 6000; }
    else if (st.k === "power") { ss.ch = {}; ss.full = {}; ss.waveAt = now + 6000; for (const id of st.objs) ss.ch[id] = 0; }
    else if (st.k === "levers") { ss.lev = {}; ss.first = 0; ss.fails = 0; }
    else if (st.k === "tide") { ss.n = 0; ss.tideAt = now + st.every; ss.warn = 0; ss.spawnAt = now + 4000; }
    else if (st.k === "bells") { ss.lit = st.objs.map(() => 1); for (let i = 0; i < 6 || ss.lit.every((v: number) => v); i++) this.bellPress(ss.lit, Math.floor(Math.random() * st.objs.length)); ss.addAt = now + st.adds.every; }
    else if (st.k === "memory") { ss.round = 0; this.memNew(inst, st, now); }
    else if (st.k === "mirrors") { ss.rot = {}; for (const id of st.objs) ss.rot[id] = Math.random() < .5 ? 1 : 0; let g = 0; while (this.beam(inst, st).hit && g++ < 20) for (const id of st.objs) ss.rot[id] = Math.random() < .5 ? 1 : 0; ss.addAt = now + st.adds.every; }
    else if (st.k === "plates") { ss.lit = {}; ss.waveAt = now + 6000; }
    else if (st.k === "escort") { ss.cart = { x: def.cx + st.path[0][0], z: st.path[0][1] }; ss.prog = 0; ss.ck = 0; ss.hp = 100; ss.spawnAt = now + 5000; ss.moving = false; }
  }

  info(inst: Inst) {
    const def = inst.def, st = def.stages[inst.stage], ss = inst.ss || {};
    let text = "Dungeon concluída!", cur = 0, need = 0, fx: any = undefined;
    if (st) {
      text = st.text; cur = inst.cnt; need = st.need || 0;
      if (st.k === "statue") {
        const nm = R.MT[st.t].n;
        if (!inst.talked) { text = st.text; need = 0; }
        else if (inst.cnt < st.need) text = `Oferenda: elimine ${nm}`;
        else { text = `Volte à ${st.name} para concluir`; need = 0; }
      } else if (st.k === "runes") { cur = ss.done ? ss.done.length : 0; need = st.objs.length; fx = { lit: ss.done || [] }; }
      else if (st.k === "defend") { cur = Math.floor(ss.acc || 0); need = st.secs; fx = { near: ss.near ? 1 : 0 }; if (!ss.near) text += " — volte ao altar!"; }
      else if (st.k === "waves") { cur = Math.max(0, ss.w || 0); need = st.list.length; text += ` — onda ${Math.max(1, (ss.w ?? -1) + 1)}/${st.list.length}`; }
      else if (st.k === "crystals") { cur = ss.broken || 0; need = st.at.length; }
      else if (st.k === "power") { const ids: string[] = st.objs; cur = ids.filter((id) => ss.full && ss.full[id]).length; need = ids.length; const g: any = {}; for (const id of ids) g[id] = Math.round(((ss.ch && ss.ch[id]) || 0) / st.secs * 100); fx = { gen: g }; }
      else if (st.k === "levers") { const on = Object.keys(ss.lev || {}); cur = on.length; need = st.objs.length; const left = ss.first ? Math.max(0, Math.ceil((ss.first + st.win * 1000 - Date.now()) / 1000)) : 0; if (ss.first) text += ` — ⏱ ${left}s`; fx = { lev: on, left }; }
      else if (st.k === "tide") { cur = ss.n || 0; need = st.count; text += ` — maré ${Math.min(st.count, (ss.n || 0) + 1)}/${st.count}`; fx = { tide: { at: ss.tideAt, warn: ss.warn ? 1 : 0, plats: st.plats, w: st.warn } }; }
      else if (st.k === "bells") { cur = (ss.lit || []).filter((v: number) => v).length; need = st.objs.length; fx = { bells: ss.lit }; }
      else if (st.k === "memory") { cur = ss.round || 0; need = st.rounds.length; text += ` — rodada ${Math.min(st.rounds.length, (ss.round || 0) + 1)}/${st.rounds.length}` + (ss.showUntil > Date.now() ? " (ouça!)" : ` • ${ss.prog || 0}/${(ss.seq || []).length}`); fx = { mem: { prog: ss.prog || 0, len: (ss.seq || []).length, sh: ss.showUntil > Date.now() ? 1 : 0 } }; }
      else if (st.k === "mirrors") { const b = this.beam(inst, st); cur = b.hit ? 1 : 0; need = 1; fx = { mir: ss.rot, beam: b.pts }; }
      else if (st.k === "plates") { const now2 = Date.now(), L: any = {}; for (const id of st.objs) L[id] = Math.max(0, (ss.lit[id] || 0) - now2); cur = st.objs.filter((id: string) => L[id] > 0).length; need = st.objs.length; fx = { pl: L, hold: st.hold }; }
      else if (st.k === "escort" && ss.cart) { cur = Math.round((ss.prog || 0) * 100); need = 100; text += ` — núcleo ${Math.max(0, Math.round(ss.hp))}%`; fx = { cart: { x: Math.round(ss.cart.x * 10) / 10, z: Math.round(ss.cart.z * 10) / 10, hp: Math.max(0, Math.round(ss.hp)), mv: ss.moving ? 1 : 0 } }; }
      else if (st.k === "boss" && ss.boss && ss.boss.immune) { if (ss.ovEnd) text += ` — ⚡ SOBRECARGA: ${Math.max(0, Math.ceil((ss.ovEnd - Date.now()) / 1000))}s`; else text += " — 🛡️ escudo ativo!"; fx = { sh: 1 }; }
    }
    return { id: def.id, name: def.name, stage: inst.stage, total: def.stages.length, text, cur, need, maxZ: this.maxZ(inst), endsAt: inst.endsAt, done: inst.done, paused: inst.paused, canPause: !inst.grp && inst.members.size === 1, fx };
  }
  sendState(inst: Inst, only?: string) {
    const msg = this.info(inst);
    for (const sid of only ? [only] : inst.members) this.h.sess.get(sid)?.client.send("dg", msg);
  }
  say(inst: Inst, text: string) { for (const sid of inst.members) this.h.sess.get(sid)?.client.send("res", { ok: true, out: [{ log: text }] }); }

  private advance(inst: Inst) {
    this.clearLazy(inst);
    inst.stage++; inst.cnt = 0; inst.talked = false;
    const def = inst.def;
    if (inst.stage >= def.stages.length) {
      inst.done = true; inst.endsAt = Math.min(inst.endsAt, Date.now() + 10 * 60_000); inst.ss = {};
      this.say(inst, `<span style="color:#ffd24a">🏆 Dungeon concluída! Um portal de saída surgiu no fim de ${def.name}. Ela se fecha em 10 minutos — colete seus tesouros e saia.</span>`);
      for (const sid of inst.members) {                                  // contagem de conclusões e títulos
        const s = this.h.sess.get(sid); if (!s) continue;
        const nw = R.dgDone(s.c, def), out: any[] = [{ sfx: "rare" }];
        out.push(...R.dwEv(s.c, "dg", { id: def.id }));                                    // missões diárias/semanais
        gpAdd(s, R.GP.dg);                                                                 // Pontos de Guilda
        out.push({ log: `<span style="color:#9fe7b0">📜 Conclusões de ${def.name}: <b>${s.c.dgc[def.id]}</b></span>` });
        if (Math.random() < R.TIX_DG) { R.tixGive(s.c, def.id); out.push({ toast: "🎟️ Ingresso encontrado!" }, { log: `<span style="color:#ffd27a">🎟️ Sorte! Você encontrou um ingresso de <b>${def.name}</b> (foi para a mochila).</span>` }); }   // v2.4.1: 10% ao concluir = ~1 a cada 10 calabouços
        for (const t of nw) out.push({ toast: "🏅 Novo título: " + t.t }, { log: `<span style="color:${t.col}">🏅 Título conquistado: <b>${t.t}</b> — abra a janela de títulos com <b>T</b>.</span>` });
        this.h.touch(s); this.h.sync(s); this.h.res(s, out);
      }
    } else {
      this.say(inst, def.rooms ? `<span style="color:#9fe7b0">🚪 O portão se abriu! Uma nova sala está liberada.</span>` : `<span style="color:#9fe7b0">🚪 O portão se abriu! Avance pela cripta.</span>`);
      this.enterStage(inst);
    }
    this.sendState(inst);
  }

  /** Chamado pelo servidor quando QUALQUER monstro de uma instância morre. */
  onKill(sim: Sim) {
    const inst = this.insts.get(sim.inst); if (!inst || inst.closed) return;
    if (sim.T.chest) return this.chestOpened(inst, sim);
    const ss = inst.ss, st = inst.def.stages[inst.stage];
    if (ss.shAdds && ss.shAdds.has(sim)) { ss.shAdds.delete(sim); if (!ss.shAdds.size) this.unshield(inst); }
    if (!st || (sim as any).lazy || sim.m.type !== st.t) return;
    if (st.k === "kill") { inst.cnt++; if (inst.cnt >= st.need) this.advance(inst); else this.sendState(inst); }
    else if (st.k === "statue") { if (inst.cnt < st.need) { inst.cnt++; this.sendState(inst); } }
    else if (st.k === "boss") {
      const ch = st.chest && inst.chests.get(st.chest.slot);
      if (ch) { ch.m.x = sim.m.x; ch.m.z = sim.m.z + 3; this.h.sim.reveal(ch); this.say(inst, `<span style="color:#ffd27a">🎁 Um baú de tesouro apareceu! <b>Destrua o baú</b> para receber seu prêmio.</span>`); }
      this.advance(inst);
    }
  }

  private chestOpened(inst: Inst, sim: Sim) {
    for (const sid of inst.members) {
      const s = this.h.sess.get(sid), p = this.h.state.players.get(sid); if (!s || !p || p.dead) continue;
      if (Math.hypot(p.x - sim.m.x, p.z - sim.m.z) > 45) continue;
      const fin = sid === sim.lastHitBy && (sim as any).lhSk && s.c.cls === "pierrot" ? R.FINISH_LUCK : 0;      // v1.69: golpe final do Pierrot com habilidade: mais sorte no baú
      const items = R.dgChestLoot(inst.def, sim.tier, s.c.cls, R.luckOf(s.c, ((s.buffs.luck && s.buffs.luck.until > Date.now()) ? s.buffs.luck.val : 0) + fin));
      if (fin) s.client.send("res", { ok: true, out: [{ log: `<span style="color:#6fdc7f">🍀 Golpe final do Pierrot: +${Math.round(fin * 100)}% de sorte neste baú!</span>` }] });
      for (const it of items) this.h.addDrop(s, it, sim.m.x, sim.m.z, 0);
      s.client.send("res", { ok: true, out: [{ toast: "🎁 O baú se abriu!" }, { sfx: "rare" }] });
    }
  }

  /* ---------- interação (E) com estátuas, runas, estelas ---------- */
  talk(s: any, id: string) {
    const p = this.h.state.players.get(s.client.sessionId), inst = this.insts.get(p?.inst || 0); if (!inst || inst.closed) return;
    const def = inst.def, st = def.stages[inst.stage];
    const o = def.objs && def.objs.find((x: any) => x.id === id);
    if (o) return this.talkObj(s, p, inst, st, o);
    const sx = st && st.at ? def.cx + st.at[0] : def.cx, sz = st && st.at ? st.at[1] : st?.z;
    if (!st || st.k !== "statue" || st.id !== id) { s.client.send("res", { ok: true, out: [{ toast: "A estátua permanece em silêncio." }] }); return; }
    if (Math.hypot(p.x - sx, p.z - sz) > 9) return;
    const say = (t: string) => s.client.send("res", { ok: true, out: [{ log: `🗿 <b>${st.name}</b>: <i>${t}</i>` }, { toast: "🗿 " + st.name }, { sfx: "questAccept" }] });
    if (!inst.talked) { inst.talked = true; say(st.ask); this.sendState(inst); }
    else if (inst.cnt < st.need) say(st.wait);
    else { say(st.fin); this.advance(inst); }
  }
  private talkObj(s: any, p: any, inst: Inst, st: any, o: any) {
    const def = inst.def, ss = inst.ss;
    if (Math.hypot(p.x - (def.cx + o.at[0]), p.z - o.at[1]) > 8) { s.client.send("res", { ok: true, out: [{ toast: "Chegue mais perto." }] }); return; }
    const msg = (t: string, tt?: string) => s.client.send("res", { ok: true, out: [{ log: t }, ...(tt ? [{ toast: tt }] : []), { sfx: "questAccept" }] });
    if (o.kind === "stele") {
      if (st && st.k === "runes" && st.stele === o.id) {
        const names = ss.order.map((rid: string) => { const r = def.objs.find((q: any) => q.id === rid); return `${r.sym} ${r.name}`; });
        msg(`📜 <b>${o.name}</b>: <i>"Acenda na ordem — ${names.join(" → ")}. Um erro apaga tudo e desperta os guardas."</i>`, "📜 " + o.name);
      } else msg(`📜 <b>${o.name}</b>: <i>A inscrição está apagada.</i>`);
    } else if (o.kind === "rune") {
      if (!st || st.k !== "runes" || !st.objs.includes(o.id)) { msg(`${o.sym} A ${o.name} permanece adormecida.`); return; }
      this.runeHit(inst, st, o, p);
    } else if (o.kind === "lever") {
      if (!st || st.k !== "levers" || !st.objs.includes(o.id)) { msg(`${o.sym} A ${o.name} está travada.`); return; }
      if (ss.lev[o.id]) { msg(`${o.sym} A ${o.name} já foi puxada — rápido, as outras!`); return; }
      ss.lev[o.id] = Date.now(); if (!ss.first) ss.first = Date.now();
      const n = Object.keys(ss.lev).length;
      this.fx(inst, { k: "lever", name: `${o.sym} ${o.name} (${n}/${st.objs.length})`, ok: 1 });
      if (n >= st.objs.length) { this.say(inst, `<span style="color:#ffd27a">⚙️ Todas as alavancas foram puxadas juntas! O portão se destravou.</span>`); this.advance(inst); }
      else this.sendState(inst);
    } else if (o.kind === "term") {
      if (st && st.k === "lasers" && st.term === o.id) { this.say(inst, `<span style="color:#ffd27a">🖥️ ${o.name}: linha desligada. Os lasers se apagaram!</span>`); this.advance(inst); }
      else msg(`🖥️ ${o.name}: <i>sem energia.</i>`);
    } else if (o.kind === "gen") {
      msg(st && st.k === "power" && st.objs.includes(o.id) ? `⚡ <b>${o.name}</b>: fique perto dele para carregar. Quanto mais gente perto, mais rápido — e longe dele a carga cai.` : `⚡ ${o.name}: zumbindo baixinho.`);
    } else if (o.kind === "bell") {
      if (!st || st.k !== "bells" || !st.objs.includes(o.id)) { msg(`🔔 ${o.name}: o sino está mudo.`); return; }
      this.bellPress(ss.lit, st.objs.indexOf(o.id)); this.fx(inst, { k: "bell", id: o.id, name: `🔔 ${o.name}` });
      if (ss.lit.every((v: number) => v)) { this.say(inst, `<span style="color:#ffd27a">🔔 Os cinco sinos tocam juntos! O casco se abriu.</span>`); this.advance(inst); return; }
      this.sendState(inst);
    } else if (o.kind === "shell") {
      if (!st || st.k !== "memory" || !st.objs.includes(o.id)) { msg(`🐚 ${o.name}: só se ouve o mar.`); return; }
      if (ss.showUntil > Date.now()) { msg("🐚 Espere as conchas terminarem de cantar."); return; }
      this.memHit(inst, st, o);
    } else if (o.kind === "mirror") {
      if (!st || st.k !== "mirrors" || !st.objs.includes(o.id)) { msg(`🪞 ${o.name}: preso no coral.`); return; }
      ss.rot[o.id] = ss.rot[o.id] ? 0 : 1; this.fx(inst, { k: "mirror", id: o.id, name: `🪞 ${o.name} girou` });
      if (this.beam(inst, st).hit) { this.say(inst, `<span style="color:#ffd27a">👁️ O raio chegou ao Olho do Recife! A parede de coral se abriu.</span>`); this.advance(inst); return; }
      this.sendState(inst);
    } else if (o.kind === "plate") {
      msg(st && st.k === "plates" ? `⬜ <b>${o.name}</b>: fique em cima dela para acender. Ela continua acesa por ${Math.round(st.hold / 1000)} s depois que você sai — acenda as ${st.objs.length} ao mesmo tempo.` : `⬜ ${o.name}: apagada.`);
    } else if (o.kind === "beamsrc" || o.kind === "beamtgt") {
      msg(st && st.k === "mirrors" ? `${o.sym} <b>${o.name}</b>: gire os espelhos (clique neles) para o raio de luz chegar ao Olho do Recife.` : `${o.sym} ${o.name}`);
    } else if (o.kind === "altar") {
      msg(st && st.k === "defend" ? `${o.sym} <b>${o.name}</b>: fiquem perto do altar enquanto a energia se acumula! Barra de progresso no alto da tela.` : `${o.sym} ${o.name}: a energia aqui está adormecida.`);
    }
  }
  private runeHit(inst: Inst, st: any, o: any, p: any) {
    const def = inst.def, ss = inst.ss;
    if (ss.done.includes(o.id)) return;
    if (ss.order[ss.done.length] === o.id) {
      ss.done.push(o.id);
      this.fx(inst, { k: "rune", name: `${o.sym} ${o.name}`, ok: 1 });
      if (ss.done.length >= ss.order.length) { this.say(inst, `<span style="color:#ffd27a">✨ Todas as runas brilham! O caminho se abre.</span>`); this.advance(inst); }
      else this.sendState(inst);
      return;
    }
    ss.done = []; ss.wrong++;                                            // errou: apaga tudo, explode e chama guardas
    const bad = st.bad || { r: 5, mult: 1.8, delay: 1000, c: "#ffb347" };
    this.h.sim.areaHit(this.env(inst, this.refAtk(inst, st)), def.cx + o.at[0], o.at[1], bad.r, bad.mult, bad.delay, bad.c);
    this.fx(inst, { k: "rune", name: "As runas se apagaram!", ok: 0 });
    this.say(inst, `<span style="color:#ff9a6a">💥 Ordem errada! As runas se apagaram e os guardas despertaram.</span>`);
    if (st.guards && ss.wrong <= 4) for (let i = 0; i < st.guards.n; i++) { const a = rnd(0, 6.283); this.spawnLazy(inst, st.guards.t, def.cx + o.at[0] + Math.cos(a) * 5, o.at[1] + Math.sin(a) * 5); }
    this.sendState(inst);
  }

  /* ---------- relógio da etapa (1x por segundo) ---------- */
  private stageTick(inst: Inst, now: number) {
    const def = inst.def, st = def.stages[inst.stage]; if (!st || inst.done) return;
    const ss = inst.ss, mem = this.alive(inst); if (!mem.length) { ss.last = now; return; }
    const dt = Math.min(2, Math.max(0, (now - (ss.last || now)) / 1000)); ss.last = now;
    const inRoom = (p: any) => !st.room || (p.x - def.cx >= st.room[0] - 4 && p.x - def.cx <= st.room[2] + 4 && p.z >= st.room[1] - 4 && p.z <= st.room[3] + 4);
    // perigos do ambiente
    if (st.hz && now >= ss.hzAt) {
      ss.hzAt = now + st.hz.every; const who = mem.filter(([, p]) => inRoom(p)), ref = this.env(inst, this.refAtk(inst, st));
      for (let i = 0; i < Math.min(st.hz.n + Math.floor(who.length / 3), 8) && who.length; i++) { const [, p] = pick(who); this.h.sim.areaHit(ref, p.x + rnd(-1.5, 1.5), p.z + rnd(-1.5, 1.5), st.hz.r, st.hz.mult, st.hz.delay, st.hz.c); }
    }
    if (st.cold && now >= ss.coldAt) {
      ss.coldAt = now + st.cold.every; ss.cm = ss.cm || new Map();
      for (const [sid, p] of mem) {
        if (!inRoom(p) || (st.fires || []).some((f: number[]) => Math.hypot(p.x - (def.cx + f[0]), p.z - f[1]) <= st.cold.r)) continue;
        this.h.sess.get(sid)?.client.send("mhit", { raw: this.refAtk(inst, st) * st.cold.mult, id: 0 });
        if (now - (ss.cm.get(sid) || 0) > 12_000) { ss.cm.set(sid, now); this.h.sess.get(sid)?.client.send("dgmsg", { k: "cold" }); }
      }
    }
    if (st.k === "defend") this.defendTick(inst, st, now, dt, mem);
    else if (st.k === "waves") this.wavesTick(inst, st, now, mem);
    else if (st.k === "crystals") this.crystalsTick(inst, st, now);
    else if (st.k === "boss") this.bossTick(inst, st, now, mem);
    else if (st.k === "lasers") this.lasersTick(inst, st, now, mem);
    else if (st.k === "power") this.powerTick(inst, st, now, dt, mem);
    else if (st.k === "levers") this.leversTick(inst, st, now);
    else if (st.k === "escort") this.escortTick(inst, st, now, dt, mem);
    else if (st.k === "tide") this.tideStage(inst, st, now, mem);
    else if (st.k === "bells" || st.k === "mirrors") this.addsTick(inst, st, now, mem);
    else if (st.k === "memory") this.memTick(inst, st, now);
    else if (st.k === "plates") this.platesTick(inst, st, now, mem);
  }
  /* ---------- v3.0.0: mecânicas da praia ---------- */
  /** maré: avisa, e quem não estiver numa plataforma leva dano. Devolve true quando a onda bateu. */
  private tide(inst: Inst, t: any, plats: number[][], now: number, mem: [string, any][], atk: number, room?: number[]): boolean {
    const ss = inst.ss, def = inst.def;
    if (!ss.warn && now >= ss.tideAt - t.warn) { ss.warn = 1; this.fx(inst, { k: "tide", t: t.warn, plats }); this.say(inst, `<span style="color:#7ad0ff">🌊 A maré está subindo! Suba numa plataforma!</span>`); }
    if (ss.warn && now >= ss.tideAt) {
      ss.warn = 0; ss.tideAt = now + t.every;
      for (const [sid, p] of mem) {
        if (room && !(p.x - def.cx >= room[0] - 2 && p.x - def.cx <= room[2] + 2 && p.z >= room[1] - 2 && p.z <= room[3] + 2)) continue;
        if (plats.some(([x, z, r]) => Math.hypot(p.x - (def.cx + x), p.z - z) <= r)) continue;
        this.h.sess.get(sid)?.client.send("mhit", { raw: atk * t.mult, id: 0 });
      }
      this.fx(inst, { k: "tidehit" }); return true;
    }
    return false;
  }
  private tideStage(inst: Inst, st: any, now: number, mem: [string, any][]) {
    const ss = inst.ss, def = inst.def, r = st.room;
    if (this.tide(inst, st, st.plats, now, mem, this.refAtk(inst, st), r)) { ss.n++; if (ss.n >= st.count) { this.say(inst, `<span style="color:#ffd27a">🌊 A maré baixou de vez! O caminho está livre.</span>`); this.advance(inst); return; } }
    if (st.spawn && now >= ss.spawnAt) {
      ss.spawnAt = now + st.spawn.every; const k = Math.min(st.spawn.cap - this.lazyAlive(inst), Math.round(rnd(st.spawn.n[0], st.spawn.n[1])) + Math.floor(mem.length / 3));
      for (let i = 0; i < k; i++) this.spawnLazy(inst, pick(st.spawn.t), def.cx + rnd(r[0] + 2, r[2] - 2), rnd(r[1] + 3, r[3] - 3));
    }
    this.sendState(inst);
  }
  private addsTick(inst: Inst, st: any, now: number, mem: [string, any][]) {
    const ss = inst.ss, def = inst.def, r = st.room; if (!st.adds || now < ss.addAt) return;
    ss.addAt = now + st.adds.every; const k = Math.min(8 - this.lazyAlive(inst), Math.round(rnd(st.adds.n[0], st.adds.n[1])) + Math.floor(mem.length / 3));
    for (let i = 0; i < k; i++) this.spawnLazy(inst, pick(st.adds.t), def.cx + rnd(r[0] + 2, r[2] - 2), rnd(r[1] + 2, r[3] - 2));
    if (k > 0) this.fx(inst, { k: "wave", name: "Algo saiu da água!" });
  }
  /** sinos: cada um vira ele e os dois vizinhos (em anel) — "acende-apaga" */
  private bellPress(lit: number[], i: number) { const n = lit.length; for (const j of [i - 1, i, i + 1]) { const k = (j + n) % n; lit[k] = lit[k] ? 0 : 1; } }
  /** conchas: o servidor toca uma sequência; os jogadores repetem */
  private memNew(inst: Inst, st: any, now: number) {
    const ss = inst.ss, n = st.rounds[ss.round]; ss.seq = []; for (let i = 0; i < n; i++) { let id; do id = pick(st.objs); while (ss.seq.length && ss.seq[ss.seq.length - 1] === id); ss.seq.push(id); }
    ss.prog = 0; ss.showUntil = now + 1500 + n * st.show;
    setTimeout(() => this.fx(inst, { k: "mem", seq: ss.seq, show: st.show }), 1200);
    this.sendState(inst);
  }
  private memHit(inst: Inst, st: any, o: any) {
    const ss = inst.ss, def = inst.def;
    if (ss.seq[ss.prog] === o.id) {
      ss.prog++; this.fx(inst, { k: "shell", id: o.id, ok: 1 });
      if (ss.prog >= ss.seq.length) {
        ss.round++;
        if (ss.round >= st.rounds.length) { this.say(inst, `<span style="color:#ffd27a">🐚 As conchas cantam em coro! A passagem se abriu.</span>`); this.advance(inst); return; }
        this.say(inst, `<span style="color:#9fe7b0">🐚 Isso! Agora uma sequência maior...</span>`); this.memNew(inst, st, Date.now() + 600); return;
      }
      this.sendState(inst); return;
    }
    const f = st.fail; this.h.sim.areaHit(this.env(inst, this.refAtk(inst, st)), def.cx + o.at[0], o.at[1], f.r, f.mult, f.delay, f.c);
    this.fx(inst, { k: "shell", id: o.id, ok: 0 }); this.say(inst, `<span style="color:#ff9a6a">🐚 Nota errada! As conchas vão cantar de novo.</span>`);
    this.memNew(inst, st, Date.now());
  }
  private memTick(inst: Inst, st: any, now: number) { const ss = inst.ss; if (ss.showUntil && now >= ss.showUntil && !ss.told) { ss.told = 1; this.sendState(inst); } if (now < ss.showUntil) ss.told = 0; }
  /** espelhos: o raio sai da fonte, reflete ("/" = 0, "\" = 1) e precisa chegar ao alvo */
  beam(inst: Inst, st: any): { hit: boolean; pts: number[][] } {
    const def = inst.def, ss = inst.ss, O = (id: string) => def.objs.find((q: any) => q.id === id);
    const src = O(st.src), tgt = O(st.tgt), mir = st.objs.map((id: string) => O(id)), r = st.room;
    let x = src.at[0], z = src.at[1], dx = st.dir[0], dz = st.dir[1]; const pts = [[x, z]]; let last: any = null;
    for (let b = 0; b < 12; b++) {
      let best: any = null, bt = 1e9;
      for (const m of mir) { if (m === last) continue; const vx = m.at[0] - x, vz = m.at[1] - z, t = vx * dx + vz * dz, perp = Math.abs(vx * dz - vz * dx); if (t > 0.5 && perp < 1.2 && t < bt) { bt = t; best = m; } }
      { const vx = tgt.at[0] - x, vz = tgt.at[1] - z, t = vx * dx + vz * dz, perp = Math.abs(vx * dz - vz * dx); if (t > 0.5 && perp < 1.6 && t < bt) { pts.push([tgt.at[0], tgt.at[1]]); return { hit: true, pts }; } }
      if (!best) { const tx = dx > 0 ? (r[2] - x) / dx : dx < 0 ? (r[0] - x) / dx : 1e9, tz = dz > 0 ? (r[3] - z) / dz : dz < 0 ? (r[1] - z) / dz : 1e9, t = Math.min(tx, tz); pts.push([x + dx * t, z + dz * t]); return { hit: false, pts }; }
      x = best.at[0]; z = best.at[1]; pts.push([x, z]); last = best;
      if (ss.rot[best.id]) { const ndx = -dz, ndz = -dx; dx = ndx; dz = ndz; } else { const ndx = dz, ndz = dx; dx = ndx; dz = ndz; }
    }
    return { hit: false, pts };
  }
  private platesTick(inst: Inst, st: any, now: number, mem: [string, any][]) {
    const ss = inst.ss, def = inst.def;
    for (const id of st.objs) { const o = def.objs.find((q: any) => q.id === id); if (mem.some(([, p]) => Math.hypot(p.x - (def.cx + o.at[0]), p.z - o.at[1]) <= st.r)) { if (!(ss.lit[id] > now)) this.fx(inst, { k: "plate", id }); ss.lit[id] = now + st.hold; } }
    if (st.objs.every((id: string) => ss.lit[id] > now)) { this.say(inst, `<span style="color:#ffd27a">⬜ As quatro placas brilham juntas! A porta de coral se abriu.</span>`); this.advance(inst); return; }
    if (now >= ss.waveAt) { ss.waveAt = now + st.waves.every; const r = st.room, k = Math.min(10 - this.lazyAlive(inst), Math.round(rnd(st.waves.n[0], st.waves.n[1])) + Math.floor(mem.length / 3));
      for (let i = 0; i < k; i++) this.spawnLazy(inst, pick(st.waves.t), def.cx + rnd(r[0] + 2, r[2] - 2), rnd(r[1] + 2, r[3] - 2)); }
    this.sendState(inst);
  }
  /* ---------- v1.91: etapas da Cidade das Máquinas ---------- */
  private lazyAlive(inst: Inst) { return inst.lazy.filter((s) => s.m.alive && !s.T.node).length; }
  private lasersTick(inst: Inst, st: any, now: number, mem: [string, any][]) {
    const def = inst.def, ss = inst.ss, r = st.room, len = r[3] - r[1];
    if (now >= ss.rowAt) {                                                     // duas fileiras de laser que avançam pelo corredor
      ss.rowAt = now + st.every; const ref = this.env(inst, this.refAtk(inst, st));
      const z1 = r[1] + 3 + ((ss.k * 5.5) % (len - 6)), z2 = r[1] + 3 + ((ss.k * 5.5 + len / 2) % (len - 6)); ss.k++;
      for (const z of [z1, z2]) for (let x = r[0] + 1; x <= r[2] - 1 + 1e-6; x += 2) this.h.sim.areaHit(ref, def.cx + x, z, 1.5, st.mult, st.delay, st.c);
    }
    if (st.spawn && now >= ss.spawnAt) {
      ss.spawnAt = now + st.spawn.every; const free = st.spawn.cap - this.lazyAlive(inst);
      const k = Math.min(free, Math.round(rnd(st.spawn.n[0], st.spawn.n[1])) + Math.floor(mem.length / 3));
      for (let i = 0; i < k; i++) this.spawnLazy(inst, pick(st.spawn.t), def.cx + rnd(r[0] + 1.5, r[2] - 1.5), rnd(r[1] + 4, r[3] - 4));
    }
  }
  private powerTick(inst: Inst, st: any, now: number, dt: number, mem: [string, any][]) {
    const def = inst.def, ss = inst.ss; let charging: any[] = [];
    for (const id of st.objs as string[]) {
      if (ss.full[id]) continue;
      const o = def.objs.find((q: any) => q.id === id), gx = def.cx + o.at[0], gz = o.at[1];
      const n = mem.filter(([, p]) => Math.hypot(p.x - gx, p.z - gz) <= st.r).length;
      if (n) { ss.ch[id] = Math.min(st.secs, ss.ch[id] + dt * (1 + 0.25 * (n - 1))); charging.push(o); }
      else ss.ch[id] = Math.max(0, ss.ch[id] - dt * 0.35);
      if (ss.ch[id] >= st.secs) { ss.full[id] = 1; this.fx(inst, { k: "gen", name: `⚡ ${o.name} carregado!` }); }
    }
    if (st.objs.every((id: string) => ss.full[id])) { this.say(inst, `<span style="color:#ffd27a">⚡ Todos os geradores voltaram a funcionar! O portão se abriu.</span>`); this.advance(inst); return; }
    if (now >= ss.waveAt) {
      ss.waveAt = now + st.waves.every; const list = charging.length ? charging : def.objs.filter((q: any) => st.objs.includes(q.id) && !ss.full[q.id]);
      const k = Math.min(14 - this.lazyAlive(inst), Math.round(rnd(st.waves.n[0], st.waves.n[1])) + Math.floor(mem.length / 3));
      for (let i = 0; i < k; i++) { const o: any = pick(list as any[]); for (let tr = 0; tr < 6; tr++) { const [x, z] = this.ring(inst, def.cx + o.at[0], o.at[1], 5, 10); if (this.spawnLazy(inst, pick(st.waves.t), x, z)) break; } }
      if (k > 0) this.fx(inst, { k: "wave", name: "As máquinas vêm atrás da energia!" });
    }
    this.sendState(inst);
  }
  private leversTick(inst: Inst, st: any, now: number) {
    const def = inst.def, ss = inst.ss;
    if (!ss.first) return;
    if (now - ss.first <= st.win * 1000) { this.sendState(inst); return; }
    ss.fails++; ss.lev = {}; ss.first = 0;                                    // demorou: as alavancas voltam e dão choque
    const bad = st.bad || { r: 5, mult: 1.6, delay: 900, c: "#6ad0ff" }, ref = this.env(inst, this.refAtk(inst, st));
    for (const id of st.objs) { const o = def.objs.find((q: any) => q.id === id); this.h.sim.areaHit(ref, def.cx + o.at[0], o.at[1], bad.r, bad.mult, bad.delay, bad.c);
      if (st.guards && ss.fails <= 4) for (let i = 0; i < Math.ceil(st.guards.n / 2); i++) { const a = rnd(0, 6.283); this.spawnLazy(inst, st.guards.t, def.cx + o.at[0] + Math.cos(a) * 5, o.at[1] + Math.sin(a) * 5); } }
    this.fx(inst, { k: "lever", name: "Tempo esgotado! As alavancas voltaram.", ok: 0 });
    this.say(inst, `<span style="color:#ff9a6a">⚡ Tempo esgotado! As alavancas voltaram ao lugar e soltaram uma descarga. Puxem as ${st.objs.length} dentro de ${st.win} s.</span>`);
    this.sendState(inst);
  }
  private escortTick(inst: Inst, st: any, now: number, dt: number, mem: [string, any][]) {
    const def = inst.def, ss = inst.ss, c = ss.cart, P0 = st.path[0], P1 = st.path[st.path.length - 1];
    const ax = def.cx + P0[0], az = P0[1], bx = def.cx + P1[0], bz = P1[1], L = Math.hypot(bx - ax, bz - az) || 1;
    this.h.sim.lure("cart" + inst.id, c, inst.id, 2500, 6, "");                     // monstros perto do núcleo atacam o núcleo
    const foes = inst.lazy.filter((s) => s.m.alive && !s.T.node && Math.hypot(s.m.x - c.x, s.m.z - c.z) < 3.2).length;
    const near = mem.some(([, p]) => Math.hypot(p.x - c.x, p.z - c.z) <= st.r);
    if (foes) ss.hp -= foes * st.loss * dt;
    ss.moving = near && !foes;
    if (ss.moving) { ss.prog = Math.min(1, ss.prog + st.spd * dt / L); c.x = ax + (bx - ax) * ss.prog; c.z = az + (bz - az) * ss.prog; ss.ck = Math.max(ss.ck, Math.floor(ss.prog * 3) / 3); }
    if (ss.hp <= 0) {                                                            // núcleo destruído: volta ao último marco (a cada 1/3 do trilho)
      ss.hp = 100; ss.prog = ss.ck; c.x = ax + (bx - ax) * ss.prog; c.z = az + (bz - az) * ss.prog;
      this.fx(inst, { k: "cart", name: "O Núcleo foi destruído! Ele voltou ao último marco." });
      this.say(inst, `<span style="color:#ff9a6a">💥 O Núcleo de Energia foi destruído e voltou ao último marco. Protejam o núcleo — com monstros perto dele, ele para e se desgasta.</span>`);
    }
    if (ss.prog >= 1) { this.say(inst, `<span style="color:#ffd27a">⚙️ O Núcleo chegou ao fim do trilho! O portão se abriu.</span>`); this.advance(inst); return; }
    if (now >= ss.spawnAt) {
      ss.spawnAt = now + st.spawn.every; const k = Math.min(st.spawn.cap - this.lazyAlive(inst), Math.round(rnd(st.spawn.n[0], st.spawn.n[1])) + Math.floor(mem.length / 3));
      const r = st.room, ux = (bx - ax) / L, uz = (bz - az) / L;
      for (let i = 0; i < k; i++) for (let tr = 0; tr < 6; tr++) { const d = rnd(5, 11), x = Math.max(def.cx + r[0] + 1.5, Math.min(def.cx + r[2] - 1.5, c.x + ux * d + rnd(-2, 2))), z = Math.max(r[1] + 1.5, Math.min(r[3] - 1.5, c.z + uz * d + rnd(-3, 3))); if (this.spawnLazy(inst, pick(st.spawn.t), x, z)) break; }
    }
    this.sendState(inst);
  }

  private ring(inst: Inst, cx: number, cz: number, r0: number, r1: number): [number, number] {
    const a = rnd(0, 6.283), r = rnd(r0, r1); return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
  }
  private defendTick(inst: Inst, st: any, now: number, dt: number, mem: [string, any][]) {
    const def = inst.def, ss = inst.ss, ax = def.cx + st.at[0], az = st.at[1];
    const near = mem.some(([, p]) => Math.hypot(p.x - ax, p.z - az) <= st.r);
    ss.near = near; if (near) ss.acc += dt;
    if (now >= ss.waveAt) {
      ss.waveAt = now + st.waves.every;
      const k = Math.round(rnd(st.waves.n[0], st.waves.n[1])) + Math.floor(mem.length / 3);
      for (let i = 0; i < k; i++) { for (let tr = 0; tr < 6; tr++) { const [x, z] = this.ring(inst, ax, az, st.r + 3, st.r + 11); if (this.spawnLazy(inst, pick(st.waves.t), x, z)) break; } }
      this.fx(inst, { k: "wave", name: "Mais inimigos!" });
    }
    if (ss.acc >= st.secs) { this.say(inst, `<span style="color:#ffd27a">✨ A energia do altar foi dominada! O caminho se abre.</span>`); this.advance(inst); return; }
    this.sendState(inst);
  }
  private wavesTick(inst: Inst, st: any, now: number, mem: [string, any][]) {
    const ss = inst.ss;
    if (ss.w >= 0 && !ss.nextAt && ss.cur.every((s: Sim) => !s.m.alive)) {
      if (ss.w >= st.list.length - 1) { this.say(inst, `<span style="color:#ffd27a">✨ O cerco foi vencido!</span>`); this.advance(inst); return; }
      ss.nextAt = now + st.gap;
    }
    if (ss.nextAt && now >= ss.nextAt) {
      ss.nextAt = 0; ss.w++; ss.cur = [];
      const w = st.list[ss.w], r = st.room;
      for (let i = 0; i < w.n + Math.floor(mem.length / 4); i++) for (let tr = 0; tr < 6; tr++) {
        const s = this.spawnLazy(inst, w.t, inst.def.cx + rnd(r[0] + 2, r[2] - 2), rnd(r[1] + 2, r[3] - 2)); if (s) { ss.cur.push(s); break; }
      }
      this.fx(inst, { k: "wave", name: `Onda ${ss.w + 1}/${st.list.length}!` });
      this.sendState(inst);
    }
  }
  private crystalsTick(inst: Inst, st: any, now: number) {
    const ss = inst.ss, def = inst.def, left = ss.crys.filter((s: Sim) => s.m.alive);
    if (left.length !== st.at.length - ss.broken) { ss.broken = st.at.length - left.length; this.fx(inst, { k: "crystal", name: `Âncora destruída! (${ss.broken}/${st.at.length})` }); this.sendState(inst); }
    if (!left.length) { this.say(inst, `<span style="color:#ffd27a">✨ As Âncoras do Vazio se estilhaçaram!</span>`); this.advance(inst); return; }
    if (now >= ss.spawnAt) {
      ss.spawnAt = now + st.spawn.every;
      const free = st.spawn.cap - inst.lazy.filter((s) => s.m.alive && !s.T.node).length;
      for (let i = 0; i < Math.min(free, 8); i++) { const c = pick(left) as Sim; const [x, z] = this.ring(inst, c.m.x, c.m.z, 2, 5); this.spawnLazy(inst, pick(st.spawn.t), x, z); }
    }
    void def;
  }

  /* ---------- mecânicas dos chefes ---------- */
  private unshield(inst: Inst) {
    const ss = inst.ss; ss.ovEnd = 0; if (ss.boss && ss.boss.immune) { ss.boss.immune = false; this.fx(inst, { k: "unshield", name: "Escudo quebrado!" }); this.say(inst, `<span style="color:#9fe7b0">💥 O escudo do chefe se quebrou! Ataque!</span>`); this.sendState(inst); }
    ss.shAdds = null;
  }
  private bossTick(inst: Inst, st: any, now: number, mem: [string, any][]) {
    const def = inst.def, ss = inst.ss, mech = st.mech;
    if (!ss.boss) ss.boss = this.h.sim.list.find((s: Sim) => s.inst === inst.id && s.m.type === st.t);
    const boss: Sim | undefined = ss.boss; if (!boss || !boss.m.alive || !mech) return;
    const m = boss.m, frac = m.hp / Math.max(1, m.maxHp);
    const b = ss.b || (ss.b = { big: new Set(), adds: new Set(), shield: new Set(), blink: new Set(), ov: new Set(), enraged: false, rainAt: now + 9000, novaAt: now + (mech.nova ? mech.nova.every * 0.6 : 0), swAt: now + (mech.sweep ? mech.sweep.every * 0.6 : 0), swA: 0 });
    const near = mem.filter(([, p]) => Math.hypot(p.x - m.x, p.z - m.z) < 40); if (!near.length) return;
    if (ss.boss.immune && (!ss.shAdds || ![...ss.shAdds].some((s: Sim) => s.m.alive))) this.unshield(inst);          // segurança: sem aliados vivos, sem escudo
    if (mech.enrage && !b.enraged && frac <= mech.enrage) { b.enraged = true; boss.atk *= 1.35; this.fx(inst, { k: "enrage", name: "FÚRIA!" }); this.say(inst, `<span style="color:#ff6a4a">🔥 ${R.MT[st.t].n} entrou em FÚRIA!</span>`); }
    if (mech.big) for (const at of mech.big.at) if (frac <= at && !b.big.has(at)) {
      b.big.add(at); this.h.sim.areaHit(boss, m.x, m.z, mech.big.r, mech.big.mult, mech.big.delay, mech.big.c);
      this.fx(inst, { k: "big", name: mech.big.name, t: mech.big.delay }); this.say(inst, `<span style="color:#ff9a6a">⚠️ ${mech.big.name}! Saiam de perto do chefe!</span>`);
    }
    if (mech.adds) for (const at of mech.adds.at) if (frac <= at && !b.adds.has(at)) {
      b.adds.add(at); for (let i = 0; i < mech.adds.n; i++) { const [x, z] = this.ring(inst, m.x, m.z, 3, 7); this.spawnLazy(inst, mech.adds.t, x, z); }
      this.fx(inst, { k: "adds", name: "Reforços!" });
    }
    if (mech.shield && !boss.immune) for (const at of mech.shield.at) if (frac <= at && !b.shield.has(at)) {
      b.shield.add(at); const set = new Set<Sim>();
      for (let i = 0; i < mech.shield.n; i++) { const [x, z] = this.ring(inst, m.x, m.z, 4, 9); const s = this.spawnLazy(inst, mech.shield.t, x, z); if (s) { set.add(s); (s as any).shieldAdd = true; } }
      if (set.size) { boss.immune = true; ss.shAdds = set; this.fx(inst, { k: "shield", name: "ESCUDO!" }); this.say(inst, `<span style="color:#9fd8ff">🛡️ ${mech.shield.text}</span>`); this.sendState(inst); }
      break;
    }
    if (mech.overload && !boss.immune) for (const at of mech.overload.at) if (frac <= at && !b.ov.has(at)) {   // v1.91: sobrecarga
      b.ov.add(at); const ov = mech.overload, set = new Set<Sim>();
      for (let i = 0; i < ov.n; i++) { for (let tr = 0; tr < 6; tr++) { const [x, z] = this.ring(inst, m.x, m.z, 5, 10); const s = this.spawnLazy(inst, ov.t, x, z, false); if (s) { set.add(s); (s as any).shieldAdd = true; break; } } }
      if (set.size) { boss.immune = true; ss.shAdds = set; ss.ovEnd = now + ov.secs * 1000; ss.ovMult = ov.mult; this.fx(inst, { k: "overload", name: "SOBRECARGA!", t: ov.secs * 1000 }); this.say(inst, `<span style="color:#ff6a4a">⚡ ${ov.text} (${ov.secs} s)</span>`); this.sendState(inst); }
      break;
    }
    if (ss.ovEnd && now >= ss.ovEnd) {                                          // não deu tempo: explosão em toda a sala
      ss.ovEnd = 0; this.h.sim.areaHit(boss, m.x, m.z, 30, ss.ovMult || 2.6, 700, "#ff2a2a");
      this.fx(inst, { k: "big", name: "EXPLOSÃO DE SOBRECARGA", t: 700 });
      if (ss.shAdds) for (const s of ss.shAdds as Set<Sim>) if (s.m.alive) { s.m.alive = false; s.m.hp = 0; }
      this.unshield(inst);
    }
    if (mech.sweep && now >= b.swAt) {                                          // v1.91: varredura de lasers (braços girando a partir do chefe)
      const sw = mech.sweep; b.swAt = now + sw.every; b.swA += Math.PI / (sw.arms * 2);
      for (let a = 0; a < sw.arms; a++) { const ang = b.swA + a * 6.2832 / sw.arms, cs = Math.cos(ang), sn = Math.sin(ang);
        for (let d = 2.4; d <= sw.len; d += 2.6) this.h.sim.areaHit(boss, m.x + cs * d, m.z + sn * d, sw.r, sw.mult, sw.delay, sw.c); }
      this.fx(inst, { k: "big", name: sw.name, t: sw.delay });
    }
    if (mech.blink) for (const at of mech.blink.at) if (frac <= at && !b.blink.has(at)) { b.blink.add(at); this.blink(inst, st, boss); }
    if (mech.nova && now >= b.novaAt) {
      b.novaAt = now + mech.nova.every; this.h.sim.areaHit(boss, m.x, m.z, mech.nova.r, mech.nova.mult, mech.nova.delay, mech.nova.c);
      this.fx(inst, { k: "big", name: mech.nova.name, t: mech.nova.delay });
    }
    if (mech.whirl && now >= (b.whAt || (b.whAt = now + mech.whirl.every * 0.6))) {      // v3.0.0: redemoinho — puxa quem está perto para o chefe e machuca no centro
      const w = mech.whirl; b.whAt = now + w.every;
      this.h.broadcast("slam", { x: m.x, z: m.z, r: w.r, inst: inst.id, t: w.delay, c: w.c });
      this.fx(inst, { k: "whirl", name: w.name, t: w.delay, x: m.x, z: m.z, r: w.r });
      setTimeout(() => { if (!boss.m.alive) return;
        for (const [sid, p] of this.alive(inst)) { const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz); if (d > w.r || d < 0.1) continue;
          const mv = Math.min(w.pull, Math.max(0, d - 2.2)), nx = p.x + dx / d * mv, nz = p.z + dz / d * mv;
          if (!def.rooms || R.dgWalk(def, inst.stage, nx, nz, 0.5)) { p.x = nx; p.z = nz; const s = this.h.sess.get(sid); if (s) { s.client.send("correct", { x: nx, z: nz }); s.tpAt = Date.now(); } } }
        this.h.sim.areaHit(boss, m.x, m.z, 3.6, w.mult, 500, w.c); }, w.delay);
    }
    if (mech.tide) { if (!b.tideInit) { b.tideInit = 1; ss.tideAt = now + mech.tide.every; ss.warn = 0; } this.tide(inst, mech.tide, mech.tide.plats, now, mem, boss.atk, st.room); }
    if (mech.rain && now >= b.rainAt) {
      const rn = mech.rain; b.rainAt = now + rn.every;
      const n = Math.min(12, rn.n + Math.floor(near.length / rn.per));
      for (let i = 0; i < n; i++) { const [, p] = pick(near); this.h.sim.areaHit(boss, p.x + rnd(-2, 2), p.z + rnd(-2, 2), rn.r, rn.mult, rn.delay, rn.c); }
    }
    void def;
  }
  private blink(inst: Inst, st: any, boss: Sim) {
    const def = inst.def, r = st.room || [-10, -10, 10, 10]; let x = boss.m.x, z = boss.m.z;
    for (let i = 0; i < 12; i++) { const qx = def.cx + rnd(r[0] + 2, r[2] - 2), qz = rnd(r[1] + 2, r[3] - 2); if (Math.hypot(qx - boss.m.x, qz - boss.m.z) >= 8 && (!def.rooms || R.dgWalk(def, inst.stage, qx, qz, 1))) { x = qx; z = qz; break; } }
    this.h.broadcast("slam", { x, z, r: 3.4, inst: inst.id, t: 1300, c: "#d09aff" });
    this.fx(inst, { k: "blink", name: "O chefe vai se teletransportar!" });
    setTimeout(() => { if (!boss.m.alive) return; boss.m.x = x; boss.m.z = z; boss.sx = x; boss.sz = z; boss.returning = false; this.h.sim.areaHit(boss, x, z, 5, 1.5, 800, "#d09aff"); }, 1300);
  }

  /** Entrar na dungeon (a partir da entrada na região). Devolve uma mensagem de erro ou null. */
  enter(s: any, id: string): string | null {
    const def = R.DUNGEONS.find((d: any) => d.id === id); if (!def) return "Dungeon inválida.";
    const sid = s.client.sessionId, p = this.h.state.players.get(sid), c = s.c;
    if (!p || p.inst) return "Você já está em uma dungeon.";
    const ent = R.NPCS.find((n: any) => n.dungeon === id);
    if (Math.hypot(p.x - ent.x, p.z - ent.z) > 9) return "Chegue mais perto do portal da dungeon.";
    if (c.level < def.minLevel) return `Nível ${def.minLevel} necessário.`;
    const now = Date.now();
    let inst: Inst | undefined, free = false;
    if (c.run && c.run.id === id) {                                   // voltando (ingresso já pago): vale até o fim da instância
      const old = this.insts.get(c.run.inst), until = c.run.until;
      if (old && !old.closed && (!until || now < until || (old.grp && old.members.size > 0))) { inst = old; free = true; }
      else {
        if (!old && (!until || now < until) && c.run.ends && now < c.run.ends) { R.tixGive(c, id); this.h.res(s, [{ log: '<span style="color:#9fe7b0">🎟️ A dungeon foi encerrada antes do tempo. Seu ingresso foi devolvido.</span>' }]); }
        delete c.run;
      }
    }
    if (!inst) {
      if (!(R.tixHave(c, id) > 0)) return "Você precisa de um ingresso. Compre com o guardião das dungeons, na vila da região.";
      const party = this.h.partyOf(s);
      if (party) {
        for (const msid of party.members) {                           // já existe instância do grupo?
          const mp = this.h.state.players.get(msid), ms = this.h.sess.get(msid);
          const cand = mp && mp.inst ? this.insts.get(mp.inst) : (ms && ms.c.run ? this.insts.get(ms.c.run.inst) : undefined);
          if (cand && cand.def.id === id && !cand.closed && !cand.done) { inst = cand; break; }
        }
        if (!inst && party.leader !== sid) return "O líder do grupo precisa entrar primeiro.";
        if (!inst && party.members.length > 1) {                       // início em grupo: todos precisam ter o ingresso
          const miss = party.members.filter((x: string) => { const ms = this.h.sess.get(x); return ms && !(R.tixHave(ms.c, id) > 0); }).map((x: string) => this.h.sess.get(x).c.name);
          if (miss.length) return "Todos do grupo precisam ter o ingresso para começar. Sem ingresso: " + miss.join(", ") + ".";
        }
      }
      if (inst && inst.members.size >= 6) return "A dungeon do seu grupo está cheia (6 jogadores).";
      if (!inst) inst = this.create(def);
    }
    if (inst.paused) return "A dungeon está pausada.";
    if (!free) R.tixTake(c, id);   // v1.79: o ingresso sai da mochila
    c.run = { id, inst: inst.id, ends: inst.endsAt };
    { const pt = this.h.partyOf(s); inst.members.add(sid); inst.emptySince = 0; if (inst.members.size > 1 || (pt && pt.members.length > 1)) inst.grp = true; }
    p.inst = inst.id; p.dead = false;
    let back = this.startOf(def);
    if (free && c.pos && c.pos.x > 450 && Math.abs(c.pos.x - def.cx) < 100) {   // voltando: onde estava (se ainda for um lugar válido)
      if (def.rooms) { if (R.dgWalk(def, inst.stage, c.pos.x, c.pos.z, 0.5)) back = c.pos; }
      else back = c.pos;
    }
    p.x = back.x; p.z = def.rooms ? back.z : Math.min(back.z, this.maxZ(inst) - 0.5); s.budget = 40; s.t = now;
    s.client.send("dgenter", { id, inst: inst.id, cx: def.cx, x: p.x, z: p.z });
    this.sendState(inst, sid);
    this.say(inst, `<span style="color:#ffe28a">${def.icon} <b>${p.name}</b> entrou na dungeon.</span>`);
    return null;
  }

  /** Sai da instância (portal de saída, desconexão). Dá 5 minutos para voltar, a menos que já tenha acabado. */
  leave(s: any, teleport: boolean, finished = false) {
    const sid = s.client.sessionId, p = this.h.state.players.get(sid); if (!p || !p.inst) return;
    const inst = this.insts.get(p.inst); const now = Date.now();
    if (inst) { inst.members.delete(sid); if (!inst.members.size) { inst.emptySince = now; if (inst.paused) this.resume(inst); } else this.sendState(inst); }
    if (s.c.run) {
      if (finished || !inst || inst.closed) delete s.c.run;               // concluiu e saiu pelo portal do fim
      else if (teleport) s.c.run.until = now + 180_000;                    // saiu pelo botão/portal: 3 minutos para voltar
      else delete s.c.run.until;                                           // queda de conexão: pode voltar enquanto a dungeon existir
    }
    if (teleport) {
      const e = this.entryOf(inst ? inst.def : R.DUNGEONS[0]);
      p.inst = 0; p.x = e.x; p.z = e.z; s.budget = 40; s.t = now; s.client.send("dgleave", { reason: "", x: p.x, z: p.z });
    }
    s.dirty = true;
  }

  pause(s: any, on: boolean): string | null {
    const p = this.h.state.players.get(s.client.sessionId), inst = this.insts.get(p?.inst || 0); if (!inst || inst.closed) return "Você não está em uma dungeon.";
    if (!on) { if (inst.paused) this.resume(inst); return null; }
    if (inst.grp || inst.members.size !== 1) return "A pausa só funciona quando você está sozinho na dungeon.";
    if (inst.paused) return null;
    if (inst.pausedTotal > 1_800_000) return "Você já usou o tempo máximo de pausa (30 min).";
    inst.paused = Date.now(); this.h.sim.frozen.add(inst.id); this.sendState(inst);
    return null;
  }
  resume(inst: Inst) {
    if (!inst.paused) return;
    const d = Date.now() - inst.paused; inst.endsAt += d; inst.pausedTotal += d; inst.paused = 0; this.h.sim.frozen.delete(inst.id); this.sendState(inst);
  }

  private eject(sid: string, msg: string, def: any) {
    const s = this.h.sess.get(sid), p = this.h.state.players.get(sid); if (!s || !p) return;
    const e = this.entryOf(def || R.DUNGEONS[0]);
    p.inst = 0; p.dead = false; p.x = e.x; p.z = e.z; s.budget = 40; s.t = Date.now(); delete s.c.run; s.dirty = true;
    s.client.send("dgleave", { reason: msg, x: p.x, z: p.z });
  }

  close(inst: Inst, msg: string) {
    inst.closed = true;
    for (const sid of [...inst.members]) this.eject(sid, msg, inst.def);
    for (const s of this.h.sess.values()) if (s.c.run && s.c.run.inst === inst.id) { delete s.c.run; s.dirty = true; }
    this.h.sim.frozen.delete(inst.id); this.h.sim.removeInst(inst.id); this.insts.delete(inst.id);
  }

  tick(now: number) {
    for (const inst of [...this.insts.values()]) {
      if (inst.paused && now - inst.paused > 600_000) this.resume(inst);      // pausa máxima de 10 min por vez
      if (inst.paused) continue;
      if (now > inst.endsAt) this.close(inst, inst.done ? `${inst.def.icon} ${inst.def.name} se fechou.` : "⏳ O tempo da dungeon acabou! Você foi levado para fora.");
      else if (!inst.members.size && inst.emptySince && now - inst.emptySince > 600_000) this.close(inst, "");
      else if (inst.members.size) { try { this.stageTick(inst, now); } catch (e) { console.error("[dungeon] etapa", inst.def.id, e); } }
    }
  }
}
