// Instâncias de dungeon: uma por grupo, com etapas, baús destrutíveis, tempo limite e 5 minutos para voltar se sair.
// Dois estilos de mapa: o corredor reto da Cripta (def.gates) e as dungeons de várias salas em grade (def.rooms, ver rules.js).
// Etapas: kill • statue • boss • runes (ordem sorteada) • defend (altar) • waves (ondas) • crystals (âncoras).
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
    if (inst.slot >= LAZY_MAX) return null;
    const def = inst.def;
    if (def.rooms && !R.dgWalk(def, inst.stage, x, z, 0.6)) return null;
    const s = this.h.sim.addDynamic(type, x, z, inst.id, inst.slot++);
    s.lazy = true; s.home = this.homeOf(def, x, z); inst.lazy.push(s);
    if (aggro) { const who = this.alive(inst); if (who.length) s.aggro = pick(who)[0]; }
    return s;
  }
  private clearLazy(inst: Inst) { for (const s of inst.lazy) if (s.m.alive) { s.m.alive = false; s.m.hp = 0; s.aggro = null; } inst.lazy = inst.lazy.filter((s) => s.m.alive); }

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
  private refAtk(inst: Inst, st: any) { const T = R.MT[st.t || st.guards?.t || (st.list && st.list[0].t) || (st.waves && st.waves.t[0]) || st.ct]; return (T && T.atk) || 600; }

  /* ---------- etapas ---------- */
  private enterStage(inst: Inst) {
    const def = inst.def, st = def.stages[inst.stage], now = Date.now(); inst.ss = { t0: now, hzAt: now + 5000, coldAt: now + 3000, last: now };
    if (!st) return;
    const ss = inst.ss;
    if (st.k === "runes") { ss.order = shuffle(st.objs); ss.done = []; ss.wrong = 0; }
    else if (st.k === "defend") { ss.acc = 0; ss.waveAt = now + 5000; }
    else if (st.k === "waves") { ss.w = -1; ss.cur = []; ss.nextAt = now + 3500; }
    else if (st.k === "crystals") { ss.spawnAt = now + 7000; ss.crys = st.at.map(([x, z]: number[]) => this.spawnLazy(inst, st.ct, def.cx + x, z, false)).filter(Boolean); ss.broken = 0; }
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
      else if (st.k === "boss" && ss.boss && ss.boss.immune) { text += " — 🛡️ escudo ativo!"; fx = { sh: 1 }; }
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
      const items = R.dgChestLoot(inst.def, sim.tier, s.c.cls, R.luckOf(s.c, (s.buffs.luck && s.buffs.luck.until > Date.now()) ? s.buffs.luck.val : 0));
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
    const ss = inst.ss; if (ss.boss && ss.boss.immune) { ss.boss.immune = false; this.fx(inst, { k: "unshield", name: "Escudo quebrado!" }); this.say(inst, `<span style="color:#9fe7b0">💥 O escudo do chefe se quebrou! Ataque!</span>`); this.sendState(inst); }
    ss.shAdds = null;
  }
  private bossTick(inst: Inst, st: any, now: number, mem: [string, any][]) {
    const def = inst.def, ss = inst.ss, mech = st.mech;
    if (!ss.boss) ss.boss = this.h.sim.list.find((s: Sim) => s.inst === inst.id && s.m.type === st.t);
    const boss: Sim | undefined = ss.boss; if (!boss || !boss.m.alive || !mech) return;
    const m = boss.m, frac = m.hp / Math.max(1, m.maxHp);
    const b = ss.b || (ss.b = { big: new Set(), adds: new Set(), shield: new Set(), blink: new Set(), enraged: false, rainAt: now + 9000, novaAt: now + (mech.nova ? mech.nova.every * 0.6 : 0) });
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
    if (mech.blink) for (const at of mech.blink.at) if (frac <= at && !b.blink.has(at)) { b.blink.add(at); this.blink(inst, st, boss); }
    if (mech.nova && now >= b.novaAt) {
      b.novaAt = now + mech.nova.every; this.h.sim.areaHit(boss, m.x, m.z, mech.nova.r, mech.nova.mult, mech.nova.delay, mech.nova.c);
      this.fx(inst, { k: "big", name: mech.nova.name, t: mech.nova.delay });
    }
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
        if (!old && (!until || now < until) && c.run.ends && now < c.run.ends) { c.tix = c.tix || {}; c.tix[id] = Math.min(5, (c.tix[id] || 0) + 1); this.h.res(s, [{ log: '<span style="color:#9fe7b0">🎟️ A dungeon foi encerrada antes do tempo. Seu ingresso foi devolvido.</span>' }]); }
        delete c.run;
      }
    }
    if (!inst) {
      if (!(c.tix && c.tix[id] > 0)) return "Você precisa de um ingresso. Compre com o guardião das dungeons, na vila da região.";
      const party = this.h.partyOf(s);
      if (party) {
        for (const msid of party.members) {                           // já existe instância do grupo?
          const mp = this.h.state.players.get(msid), ms = this.h.sess.get(msid);
          const cand = mp && mp.inst ? this.insts.get(mp.inst) : (ms && ms.c.run ? this.insts.get(ms.c.run.inst) : undefined);
          if (cand && cand.def.id === id && !cand.closed && !cand.done) { inst = cand; break; }
        }
        if (!inst && party.leader !== sid) return "O líder do grupo precisa entrar primeiro.";
        if (!inst && party.members.length > 1) {                       // início em grupo: todos precisam ter o ingresso
          const miss = party.members.filter((x: string) => { const ms = this.h.sess.get(x); return ms && !(ms.c.tix && ms.c.tix[id] > 0); }).map((x: string) => this.h.sess.get(x).c.name);
          if (miss.length) return "Todos do grupo precisam ter o ingresso para começar. Sem ingresso: " + miss.join(", ") + ".";
        }
      }
      if (inst && inst.members.size >= 6) return "A dungeon do seu grupo está cheia (6 jogadores).";
      if (!inst) inst = this.create(def);
    }
    if (inst.paused) return "A dungeon está pausada.";
    if (!free) { c.tix[id]--; if (c.tix[id] <= 0) delete c.tix[id]; }
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
