// Casa de Leilão: compra e venda entre jogadores. Tudo é validado aqui no servidor.
// - Cada conta pode ter até AH_SLOTS anúncios (vagas). Itens idênticos pelo mesmo preço dividem 1 vaga (mostra a quantidade).
// - O ouro das vendas fica guardado na conta (accounts.ah_gold) até o jogador recolher no Leilão.
import { pool } from "./db";
const R: any = require("./rules.js");

export const AH_SLOTS = 10;
const MAX_PRICE = 100_000_000;   // por unidade
const PAGE = 30;
const NEAR = 8;

const sortObj = (o: any): any => Array.isArray(o) ? o.map(sortObj) : o && typeof o === "object" ? Object.keys(o).sort().reduce((a: any, k) => { a[k] = sortObj(o[k]); return a; }, {}) : o;
export const ikeyOf = (it: any) => it.k === "eq" ? JSON.stringify(sortObj(it)) : it.k + ":" + it.id;
const proto = (it: any) => it.k === "eq" ? JSON.parse(JSON.stringify(it)) : { k: it.k, id: it.id };
const fold = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function fitsClass(it: any, cls: string) {
  if (it.k !== "eq") return false;
  if (it.cls && it.cls !== cls) return false;
  if (it.slot === "cape" && it.cs !== R.capeKind(cls)) return false;
  return true;
}
const chunks = (p: any, qty: number) => {
  if (p.k === "eq") return Array.from({ length: qty }, () => proto(p));
  const o: any[] = []; let n = qty; while (n > 0) { const a = Math.min(99, n); o.push({ k: p.k, id: p.id, n: a }); n -= a; } return o;
};
function fits(inv: any[], p: any, qty: number) {
  const c = JSON.parse(JSON.stringify(inv));
  for (const it of chunks(p, qty)) if (!R.addItem(c, it)) return false;
  return true;
}
const invKey = (it: any) => (it && (it.k === "eq" || it.k === "mat" || it.k === "pot")) ? ikeyOf(it) : "";
const invCount = (c: any, key: string) => c.inv.reduce((a: number, s: any) => a + (s && invKey(s) === key ? (s.k === "eq" ? 1 : s.n) : 0), 0);
function invTake(c: any, key: string, q: number) {
  for (let i = 0; i < c.inv.length && q > 0; i++) {
    const s = c.inv[i]; if (!s || invKey(s) !== key) continue;
    if (s.k === "eq") { c.inv[i] = null; q--; } else { const a = Math.min(s.n, q); s.n -= a; q -= a; if (s.n <= 0) c.inv[i] = null; }
  }
}
const itemOut = (p: any, n = 1) => p.k === "eq" ? p : { k: p.k, id: p.id, n };

async function slotsUsed(accId: number) {
  const r = await pool.query("select count(*)::int as n from auction where account_id=$1", [accId]);
  return r.rows[0].n as number;
}
async function ahGold(accId: number) {
  const r = await pool.query("select ah_gold from accounts where id=$1", [accId]);
  return Number(r.rows[0]?.ah_gold || 0);
}

/** entrega os itens ao jogador; o que não couber na mochila cai no chão ao lado dele */
function give(room: any, s: any, p: any, qty: number) {
  let dropped = false;
  const pl = room.state.players.get(s.client.sessionId);
  for (const it of chunks(p, qty)) if (!R.addItem(s.c.inv, it)) { dropped = true; if (pl) room.addDrop(s, it, pl.x, pl.z, 0); }
  if (dropped) room.sysTo(s, "Mochila cheia: parte dos itens caiu no chão ao seu lado!");
}

export async function auctionMsg(room: any, s: any, m: any) {
  const reply = (o: any) => s.client.send("ahr", o);
  const fail = (msg: string, extra: any = {}) => reply({ op: m.op, ok: false, msg, ...extra });
  const p = room.state.players.get(s.client.sessionId);
  const npc = R.NPCS.find((n: any) => n.id === "leilao");
  if (!p || !npc || Math.hypot(npc.x - p.x, npc.z - p.z) > NEAR) return fail("Chegue perto do Leiloeiro.");
  if (s.ah) return fail("Aguarde a operação anterior.");
  s.ah = 1;
  try {
    const c = s.c, accId = s.acc.id;
    const op = String(m.op || "");

    if (op === "search") {
      const f = m.f || {};
      const num = (v: any, d: number, a: number, b: number) => { if (v === "" || v == null) return d; v = Number(v); return Number.isFinite(v) ? Math.max(a, Math.min(b, Math.floor(v))) : d; };
      const q = fold(String(f.q || "").slice(0, 40));
      const cat = ["eq", "mat", "pot"].includes(f.cat) ? f.cat : "";
      const slot = R.SLOTS[f.slot] ? f.slot : "";
      const cls = R.CLASSES[f.cls] ? f.cls : "";
      const rar = num(f.rar, -1, -1, 3);
      const lvMin = num(f.lvMin, 0, 0, 999), lvMax = num(f.lvMax, 999, 0, 999);
      const plusMin = num(f.plusMin, 0, 0, 10), slMin = num(f.slMin, 0, 0, 2);
      const attr = ["str", "agi", "int", "vit", "atk", "def", "hp"].includes(f.attr) ? f.attr : "";
      const pMin = num(f.pMin, 0, 0, MAX_PRICE), pMax = num(f.pMax, MAX_PRICE, 0, MAX_PRICE);
      const afford = !!f.afford, mineOnly = !!f.mine, usable = !!f.usable;
      const sort = ["asc", "desc", "new", "lvl"].includes(f.sort) ? f.sort : "asc";
      let page = num(f.page, 0, 0, 9999);
      const rows = (await pool.query("select id,account_id,seller,item,qty,price from auction order by price asc, id asc limit 5000")).rows;
      const out: any[] = [];
      for (const r of rows) {
        const it = r.item;
        if (mineOnly && r.account_id !== accId) continue;
        if (cat && it.k !== cat) continue;
        if (slot && (it.k !== "eq" || it.slot !== slot)) continue;
        if (cls && !fitsClass(it, cls)) continue;
        if (usable && !(it.k !== "eq" || (c.level >= it.req && fitsClass(it, c.cls)))) continue;
        if (rar >= 0 && !(it.k === "eq" && it.rar === rar)) continue;
        const lv = it.k === "eq" ? it.req : 0;
        if ((lvMin > 0 || lvMax < 999) && !(it.k === "eq" && lv >= lvMin && lv <= lvMax)) continue;
        if (plusMin > 0 && !(it.k === "eq" && (it.plus || 0) >= plusMin)) continue;
        if (slMin > 0 && !(it.k === "eq" && (it.sl || 0) >= slMin)) continue;
        if (attr) { const v = it.k === "eq" ? (["str", "agi", "int", "vit"].includes(attr) ? (it.bon && it.bon[attr]) : it[attr]) : 0; if (!(v > 0)) continue; }
        if (r.price < pMin || r.price > pMax) continue;
        if (afford && r.price > c.gold && !c.gm) continue;
        if (q && !fold(R.nm(itemOut(it))).includes(q)) continue;
        out.push(r);
      }
      if (sort === "desc") out.sort((a, b) => b.price - a.price || b.id - a.id);
      else if (sort === "new") out.sort((a, b) => b.id - a.id);
      else if (sort === "lvl") out.sort((a, b) => ((b.item.req || 0) - (a.item.req || 0)) || a.price - b.price);
      else out.sort((a, b) => a.price - b.price || a.id - b.id);
      const pages = Math.max(1, Math.ceil(out.length / PAGE)); page = Math.min(page, pages - 1);
      const list = out.slice(page * PAGE, page * PAGE + PAGE).map((r) => ({ id: r.id, item: itemOut(r.item, r.qty), qty: r.qty, price: r.price, seller: r.seller, mine: r.account_id === accId }));
      return reply({ op, ok: true, list, total: out.length, page, pages, gold: await ahGold(accId), used: await slotsUsed(accId), all: rows.length });
    }

    if (op === "mine") {
      const rows = (await pool.query("select id,seller,item,qty,price from auction where account_id=$1 order by id", [accId])).rows;
      return reply({ op, ok: true, list: rows.map((r: any) => ({ id: r.id, item: itemOut(r.item, r.qty), qty: r.qty, price: r.price, mine: true })), gold: await ahGold(accId), used: rows.length });
    }

    if (op === "collect") {
      const r = await pool.query("with o as (select ah_gold from accounts where id=$1 for update) update accounts a set ah_gold=0 from o where a.id=$1 returning o.ah_gold as g", [accId]);
      const g = Number(r.rows[0]?.g || 0);
      if (g <= 0) return fail("Você não tem ganhos para receber.");
      if (!room.sess.has(s.client.sessionId)) { await pool.query("update accounts set ah_gold=ah_gold+$2 where id=$1", [accId, g]); return; }
      c.gold += g; room.touch(s); room.sync(s);
      room.res(s, [{ sfx: "coin" }, { toast: `💰 Você recebeu ${g} ouro das vendas.` }]);
      return reply({ op, ok: true, msg: `Você recebeu ${g} ouro.`, got: g, gold: 0 });
    }

    if (op === "sell") {
      const i = m.i;
      if (!Number.isInteger(i) || i < 0 || i >= c.inv.length || !c.inv[i]) return fail("Item inválido.");
      const it = c.inv[i]; if (!["eq", "mat", "pot"].includes(it.k)) return fail("Este item não pode ser leiloado.");
      const price = Number(m.price);
      if (!Number.isInteger(price) || price < 1 || price > MAX_PRICE) return fail(`Informe o valor (por unidade) entre 1 e ${MAX_PRICE}.`);
      const key = invKey(it), have = invCount(c, key);
      let qty = Number(m.qty); if (!Number.isInteger(qty) || qty < 1) qty = 1;
      if (qty > have) return fail("Você não tem essa quantidade.");
      const p0 = proto(it);
      // reserva os itens (tira da mochila) antes de falar com o banco; devolve se der erro
      invTake(c, key, qty);
      let okDb = false;
      try {
        const cl = await pool.connect();
        try {
          await cl.query("begin");
          await cl.query("select pg_advisory_xact_lock($1)", [accId]);
          const ex = await cl.query("select id from auction where account_id=$1 and ikey=$2 and price=$3 limit 1 for update", [accId, key, price]);
          if (ex.rowCount) {
            await cl.query("update auction set qty=qty+$2 where id=$1", [ex.rows[0].id, qty]);
          } else {
            const n = await cl.query("select count(*)::int as n from auction where account_id=$1", [accId]);
            if (n.rows[0].n >= AH_SLOTS) { await cl.query("rollback"); cl.release(); give(room, s, p0, qty); room.touch(s); room.sync(s); return fail(`Limite de ${AH_SLOTS} anúncios atingido.`); }
            await cl.query("insert into auction(account_id,seller,ikey,item,qty,price) values($1,$2,$3,$4,$5,$6)", [accId, c.name, key, JSON.stringify(p0), qty, price]);
          }
          await cl.query("commit"); okDb = true;
        } catch (e) { try { await cl.query("rollback"); } catch {} throw e; } finally { try { cl.release(); } catch {} }
      } catch (e) { console.error("leilão/sell", e); }
      if (!okDb) { give(room, s, p0, qty); room.touch(s); room.sync(s); return fail("Não foi possível anunciar agora."); }
      room.touch(s); room.sync(s);
      room.res(s, [{ sfx: "ui" }, { toast: `⚖️ Anunciado: ${R.nm(itemOut(p0))}${qty > 1 ? " ×" + qty : ""}` }]);
      return reply({ op, ok: true, msg: `Anunciado: ${R.nm(itemOut(p0))}${qty > 1 ? " ×" + qty : ""} por ${price} cada.` });
    }

    if (op === "cancel") {
      const id = Number(m.id); if (!Number.isInteger(id)) return fail("Anúncio inválido.");
      const r0 = await pool.query("select item,qty from auction where id=$1 and account_id=$2", [id, accId]);
      if (!r0.rowCount) return fail("Anúncio não encontrado.");
      if (!fits(c.inv, r0.rows[0].item, r0.rows[0].qty)) return fail("Mochila cheia! Libere espaço para retirar o item.");
      const r = await pool.query("delete from auction where id=$1 and account_id=$2 returning item,qty", [id, accId]);
      if (!r.rowCount) return fail("Anúncio não encontrado.");
      give(room, s, r.rows[0].item, r.rows[0].qty); room.touch(s); room.sync(s);
      room.res(s, [{ sfx: "ui" }, { toast: "Anúncio retirado." }]);
      return reply({ op, ok: true, msg: "Anúncio retirado: itens devolvidos à mochila." });
    }

    if (op === "buy") {
      const id = Number(m.id), qty = Number(m.qty), exp = Number(m.price);
      if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || !Number.isInteger(exp)) return fail("Pedido inválido.");
      const r0 = await pool.query("select account_id,item,qty,price,seller from auction where id=$1", [id]);
      const L = r0.rows[0];
      if (!L) return fail("Este item não está mais à venda.", { gone: id });
      if (L.account_id === accId) return fail("Você não pode comprar o seu próprio anúncio.");
      if (L.price !== exp) return fail("O preço mudou. Atualize a lista.");
      if (qty > L.qty) return fail("Quantidade indisponível. Atualize a lista.");
      const total = L.price * qty;
      if (!c.gm && c.gold < total) return fail(`Ouro insuficiente: faltam ${total - c.gold} 💰.`);
      if (!fits(c.inv, L.item, qty)) return fail("Mochila cheia!");
      if (!c.gm) c.gold -= total;     // reserva o ouro antes de falar com o banco
      let ok = false;
      const cl = await pool.connect();
      try {
        await cl.query("begin");
        const u = await cl.query("update auction set qty=qty-$2 where id=$1 and qty>=$2 and price=$3 returning qty", [id, qty, exp]);
        if (u.rowCount) {
          if (u.rows[0].qty <= 0) await cl.query("delete from auction where id=$1", [id]);
          await cl.query("update accounts set ah_gold=ah_gold+$2 where id=$1", [L.account_id, total]);
          ok = true;
        }
        await cl.query(ok ? "commit" : "rollback");
      } catch (e) { ok = false; try { await cl.query("rollback"); } catch {} console.error("leilão/buy", e); } finally { cl.release(); }
      if (!ok) { if (!c.gm) c.gold += total; room.touch(s); room.sync(s); return fail("Alguém foi mais rápido: o item não está mais disponível.", { gone: id }); }
      give(room, s, L.item, qty); room.touch(s); room.sync(s);
      const label = R.nm(itemOut(L.item)) + (qty > 1 ? " ×" + qty : "");
      room.res(s, [{ sfx: "coin" }, { toast: `🛒 Comprado: ${label} por ${total} 💰` }]);
      for (const t of room.sess.values()) if (t.acc.id === L.account_id) room.sysTo(t, `⚖️ Leilão: ${label} foi vendido por ${total} ouro. Recolha seus ganhos no Leiloeiro!`);
      return reply({ op, ok: true, msg: `Comprado: ${label} por ${total} ouro.`, bought: id });
    }

    return fail("Operação desconhecida.");
  } catch (e) {
    console.error("leilão", e);
    return fail("Erro no leilão. Tente de novo.");
  } finally { s.ah = 0; }
}
