// Troca direta entre dois jogadores: convite -> ofertas (itens + ouro) -> confirmação dos dois -> troca atômica.
// O servidor guarda as ofertas, revalida tudo na hora de trocar e só então move itens e ouro.
import { tradeable, invKey, itemOut, chunks, proto } from "./itemutil";
const R: any = require("./rules.js");

type Line = { i: number; key: string; qty: number };
type Offer = { lines: Line[]; gold: number };
type Trade = { id: number; a: string; b: string; open: boolean; off: Record<string, Offer>; ok: Record<string, boolean>; until: number };
const RANGE = 14, MAXLINES = 10;
let seq = 0;

const T = (room: any): Map<number, Trade> => (room.trades ||= new Map());
const other = (t: Trade, sid: string) => (sid === t.a ? t.b : t.a);
const nameOf = (room: any, sid: string) => room.state.players.get(sid)?.name || "Jogador";
const close = (room: any, t: Trade, msg: string, done = false) => {
  T(room).delete(t.id);
  for (const sid of [t.a, t.b]) { const s = room.sess.get(sid); if (s) { s.trade = 0; s.client.send("trr", { op: "end", msg, done }); } }
};
const near = (room: any, a: string, b: string) => {
  const p = room.state.players.get(a), q = room.state.players.get(b);
  return !!p && !!q && Math.hypot(p.x - q.x, p.z - q.z) <= RANGE;
};
/** o que cada lado vê da oferta (itens atuais da mochila de quem ofereceu) */
function show(room: any, t: Trade, sid: string) {
  const s = room.sess.get(sid), o = t.off[sid];
  return { items: o.lines.map((l) => { const it = s.c.inv[l.i]; return it ? { i: l.i, item: itemOut(proto(it), l.qty), qty: l.qty } : null; }).filter(Boolean), gold: o.gold };
}
function push(room: any, t: Trade) {
  for (const sid of [t.a, t.b]) {
    const s = room.sess.get(sid); if (!s) continue;
    s.client.send("trr", { op: "st", mine: show(room, t, sid), theirs: show(room, t, other(t, sid)), okMine: t.ok[sid], okTheirs: t.ok[other(t, sid)] });
  }
}
function tradeExec(room: any, t: Trade) {
  const A = room.sess.get(t.a), B = room.sess.get(t.b);
  if (!A || !B) return close(room, t, "A troca foi cancelada.");
  if (!near(room, t.a, t.b)) return close(room, t, "Os jogadores se afastaram demais. Troca cancelada.");
  const side = new Map<string, { inv: any[]; get: any[] }>();
  for (const [me, you] of [[A, B], [B, A]] as any[]) {
    const mo = t.off[me.client.sessionId], yo = t.off[you.client.sessionId];
    const inv = JSON.parse(JSON.stringify(me.c.inv)), get: any[] = [];
    for (const l of mo.lines) {         // revalida a oferta de quem dá
      const it = me.c.inv[l.i];
      if (!tradeable(it) || invKey(it) !== l.key || (it.k !== "eq" && it.n < l.qty)) return close(room, t, `${nameOf(room, me.client.sessionId)} mudou a mochila: troca cancelada.`);
      if (it.k === "eq") inv[l.i] = null; else { inv[l.i].n -= l.qty; if (inv[l.i].n <= 0) inv[l.i] = null; }
    }
    if (mo.gold > 0 && (me.c.gm || me.c.gold < mo.gold)) return close(room, t, `${nameOf(room, me.client.sessionId)} não tem o ouro oferecido: troca cancelada.`);
    for (const l of yo.lines) {         // o que vai chegar (itens do outro lado)
      const it = you.c.inv[l.i]; if (!tradeable(it) || invKey(it) !== l.key) return close(room, t, "A oferta mudou: troca cancelada.");
      get.push(...chunks(proto(it), l.qty).map((c: any, k: number) => (it.k === "eq" ? JSON.parse(JSON.stringify(it)) : c)));
    }
    for (const g of get) if (!R.addItem(inv, g)) return close(room, t, `${nameOf(room, me.client.sessionId)} não tem espaço na mochila: troca cancelada.`);
    side.set(me.client.sessionId, { inv, get });
  }
  const oa = t.off[t.a], ob = t.off[t.b];
  A.c.inv = side.get(t.a)!.inv; B.c.inv = side.get(t.b)!.inv;
  if (!A.c.gm) A.c.gold += ob.gold - oa.gold; if (!B.c.gm) B.c.gold += oa.gold - ob.gold;
  for (const s of [A, B]) { room.touch(s); room.sync(s); room.res(s, [{ sfx: "coin" }, { toast: "🤝 Troca concluída!" }]); }
  console.log(`[troca] ${A.c.name} <-> ${B.c.name}: ${oa.lines.length} item(ns)+${oa.gold}$ por ${ob.lines.length} item(ns)+${ob.gold}$`);
  close(room, t, "Troca concluída!", true);
}

export function tradeLeave(room: any, sid: string) {
  const s = room.sess.get(sid); if (!s || !s.trade) return;
  const t = T(room).get(s.trade); if (t) close(room, t, `${nameOf(room, sid)} saiu da troca.`);
}

export function tradeMsg(room: any, s: any, m: any) {
  const sid = s.client.sessionId, op = String(m.op || "");
  const say = (x: string) => room.sysTo(s, x);
  if (op === "invite") {
    if (s.trade) return say("Você já está em uma troca.");
    const t = room.findByName(String(m.name || ""));
    if (!t || t === s) return say(`Jogador "${String(m.name || "").slice(0, 16)}" não está online.`);
    if (t.trade) return say("Esse jogador já está em uma troca.");
    if (!near(room, sid, t.client.sessionId)) return say("Chegue mais perto desse jogador para trocar.");
    const tr: Trade = { id: ++seq, a: sid, b: t.client.sessionId, open: false, off: {}, ok: {}, until: Date.now() + 30_000 };
    tr.off[tr.a] = { lines: [], gold: 0 }; tr.off[tr.b] = { lines: [], gold: 0 }; tr.ok[tr.a] = false; tr.ok[tr.b] = false;
    T(room).set(tr.id, tr); s.trade = tr.id; t.trade = tr.id;
    t.client.send("trr", { op: "inv", from: nameOf(room, sid) });
    s.client.send("trr", { op: "wait", with: nameOf(room, t.client.sessionId) });
    return;
  }
  const t = s.trade ? T(room).get(s.trade) : undefined;
  if (!t) return;
  if (op === "cancel") return close(room, t, `${nameOf(room, sid)} cancelou a troca.`);
  if (!t.open) {
    if (op !== "accept") return;
    if (sid !== t.b) return;
    if (Date.now() > t.until) return close(room, t, "O convite de troca expirou.");
    if (!m.ok) return close(room, t, `${nameOf(room, sid)} recusou a troca.`);
    t.open = true;
    for (const x of [t.a, t.b]) room.sess.get(x)?.client.send("trr", { op: "open", with: nameOf(room, other(t, x)) });
    return push(room, t);
  }
  if (!near(room, t.a, t.b)) return close(room, t, "Os jogadores se afastaram demais. Troca cancelada.");
  if (op === "offer") {
    const raw = Array.isArray(m.items) ? m.items.slice(0, MAXLINES) : [];
    const seen = new Set<number>(), lines: Line[] = [];
    for (const r of raw) {
      const i = r?.i, it = s.c.inv[i];
      if (!Number.isInteger(i) || !tradeable(it) || seen.has(i)) return say("Oferta inválida.");
      let qty = Number(r.qty); if (!Number.isInteger(qty) || qty < 1) qty = 1;
      qty = it.k === "eq" ? 1 : Math.min(qty, it.n);
      seen.add(i); lines.push({ i, key: invKey(it), qty });
    }
    let gold = Math.floor(Number(m.gold) || 0); if (gold < 0) gold = 0;
    if (gold > 0 && s.c.gm) { gold = 0; say("Contas GM não podem oferecer ouro."); }
    if (gold > s.c.gold) gold = s.c.gold;
    t.off[sid] = { lines, gold }; t.ok[t.a] = false; t.ok[t.b] = false;
    return push(room, t);
  }
  if (op === "confirm") {
    t.ok[sid] = true; push(room, t);
    if (t.ok[t.a] && t.ok[t.b]) tradeExec(room, t);
  }
}
