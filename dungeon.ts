// Instâncias de dungeon: um corredor reto por grupo, com etapas (matar N monstros, estátuas com missão,
// sub-chefes, chefe final), baús destrutíveis, tempo limite e 5 minutos para voltar se sair.
import { Sim } from "./monsters";
const R: any = require("./rules.js");

export type Inst = {
  id: number; def: any; endsAt: number; stage: number; cnt: number; talked: boolean; done: boolean; closed: boolean;
  members: Set<string>; emptySince: number; chests: Map<number, Sim>;
};

export class Dungeons {
  insts = new Map<number, Inst>();
  private seq = 1;
  constructor(private h: any) {}

  entryOf(def: any) { const n = R.NPCS.find((x: any) => x.dungeon === def.id); return { x: n.x, z: n.z - 4 }; }

  create(def: any): Inst {
    const id = ++this.seq, inst: Inst = { id, def, endsAt: Date.now() + (Number(process.env.DG_TIME) || def.time) * 1000, stage: 0, cnt: 0, talked: false, done: false, closed: false, members: new Set(), emptySince: Date.now(), chests: new Map() };
    let slot = 0;
    for (const st of def.stages) {
      const sp = st.spawn;
      for (let i = 0; i < sp.n; i++) {
        const z = sp.z[0] === sp.z[1] ? sp.z[0] : sp.z[0] + Math.random() * (sp.z[1] - sp.z[0]);
        const x = sp.n === 1 ? def.cx : def.cx + (Math.random() * 2 - 1) * 9;
        this.h.sim.addDynamic(sp.t, x, z, id, slot++);
      }
      if (st.chest) inst.chests.set(st.chest.slot, this.h.sim.addDynamic("dg_chest", def.cx, sp.z[0] + 3, id, st.chest.slot, true, st.chest.tier));
    }
    this.insts.set(id, inst);
    return inst;
  }

  maxZ(inst: Inst) { return inst.def.gates[Math.min(inst.stage, inst.def.gates.length - 1)]; }

  info(inst: Inst) {
    const def = inst.def, st = def.stages[inst.stage];
    let text = "Dungeon concluída!", cur = 0, need = 0;
    if (st) {
      text = st.text; cur = inst.cnt; need = st.need || 0;
      if (st.k === "statue") {
        const nm = R.MT[st.t].n;
        if (!inst.talked) { text = st.text; need = 0; }
        else if (inst.cnt < st.need) text = `Oferenda: elimine ${nm}`;
        else { text = `Volte à ${st.name} para concluir`; need = 0; }
      } else if (st.k === "kill") text = `${st.text}`;
    }
    return { id: def.id, name: def.name, stage: inst.stage, total: def.stages.length, text, cur, need, maxZ: this.maxZ(inst), endsAt: inst.endsAt, done: inst.done };
  }
  sendState(inst: Inst, only?: string) {
    const msg = this.info(inst);
    for (const sid of only ? [only] : inst.members) this.h.sess.get(sid)?.client.send("dg", msg);
  }
  say(inst: Inst, text: string) { for (const sid of inst.members) this.h.sess.get(sid)?.client.send("res", { ok: true, out: [{ log: text }] }); }

  private advance(inst: Inst) {
    inst.stage++; inst.cnt = 0; inst.talked = false;
    if (inst.stage >= inst.def.stages.length) {
      inst.done = true; inst.endsAt = Math.min(inst.endsAt, Date.now() + 10 * 60_000);
      this.say(inst, `<span style="color:#ffd24a">🏆 Dungeon concluída! Um portal de saída surgiu no fim da cripta. Ela se fecha em 10 minutos — colete seus tesouros e saia.</span>`);
      for (const sid of inst.members) {                                  // contagem de conclusões e títulos
        const s = this.h.sess.get(sid); if (!s) continue;
        const nw = R.dgDone(s.c, inst.def), out: any[] = [{ sfx: "rare" }];
        out.push({ log: `<span style="color:#9fe7b0">📜 Conclusões de ${inst.def.name}: <b>${s.c.dgc[inst.def.id]}</b></span>` });
        for (const t of nw) out.push({ toast: "🏅 Novo título: " + t.t }, { log: `<span style="color:${t.col}">🏅 Título conquistado: <b>${t.t}</b> — abra a janela de títulos com <b>T</b>.</span>` });
        this.h.touch(s); this.h.sync(s); this.h.res(s, out);
      }
    } else this.say(inst, `<span style="color:#9fe7b0">🚪 O portão se abriu! Avance pela cripta.</span>`);
    this.sendState(inst);
  }

  /** Chamado pelo servidor quando QUALQUER monstro de uma instância morre. */
  onKill(sim: Sim) {
    const inst = this.insts.get(sim.inst); if (!inst || inst.closed) return;
    if (sim.T.chest) return this.chestOpened(inst, sim);
    const st = inst.def.stages[inst.stage]; if (!st || sim.m.type !== st.t) return;
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

  /** Conversa com uma estátua. */
  talk(s: any, id: string) {
    const p = this.h.state.players.get(s.client.sessionId), inst = this.insts.get(p?.inst || 0); if (!inst || inst.closed) return;
    const st = inst.def.stages[inst.stage]; if (!st || st.k !== "statue" || st.id !== id) { s.client.send("res", { ok: true, out: [{ toast: "A estátua permanece em silêncio." }] }); return; }
    if (Math.hypot(p.x - inst.def.cx, p.z - st.z) > 9) return;
    const say = (t: string) => s.client.send("res", { ok: true, out: [{ log: `🗿 <b>${st.name}</b>: <i>${t}</i>` }, { toast: "🗿 " + st.name }, { sfx: "questAccept" }] });
    if (!inst.talked) { inst.talked = true; say(st.ask); this.sendState(inst); }
    else if (inst.cnt < st.need) say(st.wait);
    else { say(st.fin); this.advance(inst); }
  }

  /** Entrar na dungeon (a partir da entrada em Solara). Devolve uma mensagem de erro ou null. */
  enter(s: any, id: string): string | null {
    const def = R.DUNGEONS.find((d: any) => d.id === id); if (!def) return "Dungeon inválida.";
    const sid = s.client.sessionId, p = this.h.state.players.get(sid), c = s.c;
    if (!p || p.inst) return "Você já está em uma dungeon.";
    const ent = R.NPCS.find((n: any) => n.dungeon === id);
    if (Math.hypot(p.x - ent.x, p.z - ent.z) > 9) return "Chegue mais perto do portal da cripta.";
    if (c.level < def.minLevel) return `Nível ${def.minLevel} necessário.`;
    const now = Date.now();
    let inst: Inst | undefined, free = false;
    if (c.run && c.run.id === id) {                                   // voltando dentro do prazo (ingresso já pago)
      const old = this.insts.get(c.run.inst);
      if (old && !old.closed && c.run.until && now < c.run.until) { inst = old; free = true; }
      else delete c.run;
    }
    if (!inst) {
      if (!(c.tix && c.tix[id] > 0)) return "Você precisa de um ingresso. Compre com o Guardião das Criptas, em Solara.";
      const party = this.h.partyOf(s);
      if (party) {
        for (const msid of party.members) {                           // já existe instância do grupo?
          const mp = this.h.state.players.get(msid), ms = this.h.sess.get(msid);
          const cand = mp && mp.inst ? this.insts.get(mp.inst) : (ms && ms.c.run && ms.c.run.until ? this.insts.get(ms.c.run.inst) : undefined);
          if (cand && cand.def.id === id && !cand.closed && !cand.done) { inst = cand; break; }
        }
        if (!inst && party.leader !== sid) return "O líder do grupo precisa entrar primeiro.";
      }
      if (inst && inst.members.size >= 6) return "A dungeon do seu grupo está cheia (6 jogadores).";
      if (!inst) inst = this.create(def);
    }
    if (!free) { c.tix[id]--; if (c.tix[id] <= 0) delete c.tix[id]; }
    c.run = { id, inst: inst.id }; delete c.run.until;
    inst.members.add(sid); inst.emptySince = 0;
    p.inst = inst.id; p.dead = false;
    const back = free && c.pos && c.pos.x > 450 ? c.pos : { x: def.cx, z: def.start.z };
    p.x = back.x; p.z = Math.min(back.z, this.maxZ(inst) - 0.5); s.budget = 40; s.t = now;
    s.client.send("dgenter", { id, inst: inst.id, cx: def.cx, x: p.x, z: p.z });
    this.sendState(inst, sid);
    this.say(inst, `<span style="color:#ffe28a">🏺 <b>${p.name}</b> entrou na dungeon.</span>`);
    return null;
  }

  /** Sai da instância (portal de saída, desconexão). Dá 5 minutos para voltar, a menos que já tenha acabado. */
  leave(s: any, teleport: boolean) {
    const sid = s.client.sessionId, p = this.h.state.players.get(sid); if (!p || !p.inst) return;
    const inst = this.insts.get(p.inst); const now = Date.now();
    if (inst) { inst.members.delete(sid); if (!inst.members.size) inst.emptySince = now; }
    if (s.c.run) { if (inst && !inst.closed && !inst.done) s.c.run.until = now + (inst.def.grace || 300) * 1000; else delete s.c.run; }
    if (teleport) {
      const e = this.entryOf(inst ? inst.def : R.DUNGEONS[0]);
      p.inst = 0; p.x = e.x; p.z = e.z; s.budget = 40; s.t = now; s.client.send("dgleave", { reason: "", x: p.x, z: p.z });
    }
    s.dirty = true;
  }

  private eject(sid: string, msg: string) {
    const s = this.h.sess.get(sid), p = this.h.state.players.get(sid); if (!s || !p) return;
    const e = this.entryOf(R.DUNGEONS[0]);
    p.inst = 0; p.dead = false; p.x = e.x; p.z = e.z; s.budget = 40; s.t = Date.now(); delete s.c.run; s.dirty = true;
    s.client.send("dgleave", { reason: msg, x: p.x, z: p.z });
  }

  close(inst: Inst, msg: string) {
    inst.closed = true;
    for (const sid of [...inst.members]) this.eject(sid, msg);
    for (const s of this.h.sess.values()) if (s.c.run && s.c.run.inst === inst.id) { delete s.c.run; s.dirty = true; }
    this.h.sim.removeInst(inst.id); this.insts.delete(inst.id);
  }

  tick(now: number) {
    for (const inst of [...this.insts.values()]) {
      if (now > inst.endsAt) this.close(inst, inst.done ? "🏺 A cripta se fechou." : "⏳ O tempo da dungeon acabou! Você foi levado para fora.");
      else if (!inst.members.size && inst.emptySince && now - inst.emptySince > (inst.def.grace + 30) * 1000) this.close(inst, "");
    }
  }
}
