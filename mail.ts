// Correio: caixa de entrada da conta (vale para todos os personagens). Guarda ouro e itens até o jogador recolher.
// Recebe: ganhos de vendas do Leilão, itens de anúncios expirados e (no futuro) recompensas de eventos.
import { pool } from "./db";
import { fits, chunks, itemOut } from "./itemutil";
const R: any = require("./rules.js");

export type MailItem = { item: any; qty: number };
export type MailIn = { kind: string; title: string; body?: string; gold?: number; items?: MailItem[] };

/** grava uma carta. `q` pode ser um client de transação para entrar junto com outra operação */
export async function sendMail(accId: number, m: MailIn, q: any = pool) {
  await q.query("insert into mail(account_id,kind,title,body,gold,items) values($1,$2,$3,$4,$5,$6)",
    [accId, m.kind, m.title.slice(0, 80), (m.body || "").slice(0, 400), Math.max(0, Math.floor(m.gold || 0)), JSON.stringify(m.items || [])]);
}
export async function unreadOf(accId: number) {
  const r = await pool.query("select count(*)::int as n from mail where account_id=$1 and not read", [accId]);
  return r.rows[0].n as number;
}
/** avisa todos os personagens online da conta sobre a quantidade de cartas novas */
export async function mailNotify(room: any, accId: number) {
  try {
    const n = await unreadOf(accId);
    for (const t of room.sess.values()) if (t.acc.id === accId) t.client.send("mailn", { n });
  } catch (e) { console.error("mailNotify", e); }
}
const view = (r: any) => ({
  id: r.id, kind: r.kind, title: r.title, body: r.body, gold: Number(r.gold), read: r.read, t: new Date(r.created_at).getTime(),
  items: (r.items || []).map((x: any) => ({ item: itemOut(x.item, x.qty), qty: x.qty })),
});

export async function mailMsg(room: any, s: any, m: any) {
  const reply = (o: any) => s.client.send("mailr", o);
  const accId = s.acc.id, op = String(m.op || "");
  const fail = (msg: string) => reply({ op, ok: false, msg });
  if (s.ml) return fail("Aguarde a operação anterior.");
  s.ml = 1;
  try {
    const list = async () => {
      const rows = (await pool.query("select * from mail where account_id=$1 order by id desc limit 100", [accId])).rows;
      return { list: rows.map(view), n: rows.filter((r: any) => !r.read).length };
    };
    if (op === "list") return reply({ op, ok: true, ...(await list()) });

    if (op === "readall") {
      await pool.query("update mail set read=true where account_id=$1 and gold=0 and items='[]'::jsonb", [accId]);
      await mailNotify(room, accId);
      return reply({ op, ok: true, ...(await list()) });
    }
    if (op === "read") {
      await pool.query("update mail set read=true where id=$1 and account_id=$2", [Number(m.id) | 0, accId]);
      room.sess.forEach((t: any) => { if (t.acc.id === accId) mailNotify(room, accId); });
      return reply({ op, ok: true, ...(await list()) });
    }

    const claimOne = async (id: number): Promise<string> => {   // devolve "" se deu certo, senão o motivo
      const r0 = await pool.query("select gold,items from mail where id=$1 and account_id=$2", [id, accId]);
      if (!r0.rowCount) return "Carta não encontrada.";
      const items: any[] = r0.rows[0].items || [];
      if (Number(r0.rows[0].gold) <= 0 && !items.length) return "Esta carta não tem anexos.";
      // todos os itens juntos precisam caber
      const sim = JSON.parse(JSON.stringify(s.c.inv));
      for (const x of items) for (const it of chunks(x.item, x.qty)) if (!R.addItem(sim, it)) return "Mochila cheia! Libere espaço para receber os itens.";
      const r = await pool.query("with o as (select gold,items from mail where id=$1 and account_id=$2 and (gold>0 or items<>'[]'::jsonb) for update) update mail m set gold=0,items='[]',read=true from o where m.id=$1 returning o.gold as gold, o.items as items", [id, accId]);
      if (!r.rowCount) return "Esta carta não tem anexos.";
      const gold = Number(r.rows[0].gold), its: any[] = r.rows[0].items || [];
      if (!room.sess.has(s.client.sessionId)) { await pool.query("update mail set gold=$3,items=$4 where id=$1 and account_id=$2", [id, accId, gold, JSON.stringify(its)]); return "Sessão encerrada."; }
      const pl = room.state.players.get(s.client.sessionId);
      for (const x of its) for (const it of chunks(x.item, x.qty)) if (!R.addItem(s.c.inv, it) && pl) room.addDrop(s, it, pl.x, pl.z, 0);
      if (gold > 0) s.c.gold += gold;
      room.touch(s); room.sync(s);
      return "";
    };

    if (op === "claim") {
      const e = await claimOne(Number(m.id) | 0);
      if (e) return fail(e);
      room.res(s, [{ sfx: "coin" }, { toast: "📬 Anexos recebidos." }]);
      await mailNotify(room, accId);
      return reply({ op, ok: true, msg: "Anexos recebidos.", ...(await list()) });
    }
    if (op === "claimall") {
      const rows = (await pool.query("select id from mail where account_id=$1 and (gold>0 or items<>'[]'::jsonb) order by id", [accId])).rows;
      let n = 0, why = "";
      for (const r of rows) { const e = await claimOne(r.id); if (e) { why = e; break; } n++; }
      if (n) room.res(s, [{ sfx: "coin" }, { toast: `📬 ${n} carta(s) recebida(s).` }]);
      await mailNotify(room, accId);
      return reply({ op, ok: n > 0 || !rows.length, msg: n ? `${n} carta(s) recebida(s).${why ? " " + why : ""}` : (why || "Nada para receber."), ...(await list()) });
    }
    if (op === "del") {
      const r = await pool.query("delete from mail where id=$1 and account_id=$2 and gold=0 and items='[]'::jsonb", [Number(m.id) | 0, accId]);
      await mailNotify(room, accId);
      return reply({ op, ok: !!r.rowCount, msg: r.rowCount ? "Carta apagada." : "Receba os anexos antes de apagar.", ...(await list()) });
    }
    return fail("Operação desconhecida.");
  } catch (e) { console.error("correio", e); return fail("Erro no correio. Tente de novo."); }
  finally { s.ml = 0; }
}

/** limpeza: cartas já lidas e sem anexos há mais de 14 dias */
export async function mailSweep() {
  try { await pool.query("delete from mail where read and gold=0 and items='[]'::jsonb and created_at < now() - interval '14 days'"); } catch (e) { console.error("mailSweep", e); }
}
