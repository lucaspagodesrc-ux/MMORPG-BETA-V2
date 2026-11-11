// Guildas: fundação no NPC (10 milhões), cargos, convites, chat próprio, baú compartilhado, cofre de ouro e prêmio coletivo semanal.
// O estado das guildas com gente online fica em memória (rápido para somar pontos a cada abate) e é gravado no banco:
// na hora, para ouro/itens/cargos, e a cada 15 s para pontos. Valores e regras ficam em rules.js (R.GUILD, R.GP, R.GTIERS...).
import { pool } from "./db";
import { sendMail, mailNotify } from "./mail";
import { tradeable, proto, fits, chunks } from "./itemutil";
const R: any = require("./rules.js");

type Mem = { id: string; acc: number; n: string; cls: string; lv: number; role: number; wpts: number; tpts: number; claimed: number; seen: number };
type Log = { t: number; m: string };
type Guild = {
  id: number; name: string; tag: string; notice: string; exp: number; gold: number; chest: any[]; wk: number; wpts: number; log: Log[];
  mem: Map<string, Mem>; dirty: boolean; md: Set<string>; fl: boolean;
};

const rooms = new Set<any>();                                         // salas que usam guildas (normalmente uma)
const G = new Map<number, Guild>();                                   // guildas carregadas (têm alguém online)
const LOADING = new Map<number, Promise<Guild | null>>();
const OF = new Map<string, number>();                                 // personagem online → guilda
const ON = new Map<string, { room: any; s: any }>();                  // personagens online
const INV = new Map<string, { gid: number; by: string; until: number }>();   // convites pendentes (por personagem convidado)
let timer: NodeJS.Timeout | undefined;

const DAY = 86400e3;
const now = () => Date.now();
const lvOf = (g: Guild) => R.guildLv(g.exp);
const nm = (it: any) => R.nm(it) + (it.k !== "eq" && it.n > 1 ? " ×" + it.n : "");
const clone = (o: any) => JSON.parse(JSON.stringify(o));
const nearTab = (room: any, s: any, tabs: string[]) => {
  const p = room.state.players.get(s.client.sessionId); if (!p) return false;
  const cxx = (x: number) => (x < -150 ? -300 : x > 450 ? 600 : x > 150 ? 300 : 0);
  return R.NPCS.some((n: any) => n.tabs && n.tabs.some((t: string) => tabs.includes(t)) && cxx(n.x) === cxx(p.x) && Math.hypot(n.x - p.x, n.z - p.z) <= 8);
};
const toMail = (items: any[]) => items.map((it) => (it.k === "eq" ? { item: it, qty: 1 } : { item: { k: it.k, id: it.id }, qty: it.n }));

/* ---------- carregar / gravar ---------- */
async function load(gid: number): Promise<Guild | null> {
  const hit = G.get(gid); if (hit) return hit;
  let pr = LOADING.get(gid);
  if (!pr) {
    pr = (async () => {
      const r = await pool.query("select * from guilds where id=$1", [gid]); if (!r.rowCount) return null;
      const row = r.rows[0], ms = (await pool.query("select * from guild_members where guild_id=$1", [gid])).rows;
      const g: Guild = { id: row.id, name: row.name, tag: row.tag, notice: row.notice || "", exp: Number(row.exp), gold: Number(row.gold), chest: Array.isArray(row.chest) ? row.chest : [], wk: Number(row.wk), wpts: Number(row.wpts), log: Array.isArray(row.log) ? row.log : [], mem: new Map(), dirty: false, md: new Set(), fl: false };
      for (const m of ms) g.mem.set(m.char_id, { id: m.char_id, acc: m.account_id, n: m.name, cls: m.cls, lv: m.level, role: m.role, wpts: Number(m.wpts), tpts: Number(m.tpts), claimed: m.claimed, seen: Number(m.seen) });
      fixChest(g);
      G.set(gid, g); return g;
    })().finally(() => LOADING.delete(gid));
    LOADING.set(gid, pr);
  }
  return pr;
}
/** o baú cresce com o nível da guilda */
function fixChest(g: Guild) { const n = R.guildChest(lvOf(g)); g.chest = g.chest.slice(0, Math.max(n, g.chest.length)).map((x: any) => x || null); while (g.chest.length < n) g.chest.push(null); }
async function flush(g: Guild) {
  if (g.fl) return; g.fl = true;
  try {
    if (g.dirty) {
      g.dirty = false;
      try { await pool.query("update guilds set notice=$2, exp=$3, gold=$4, chest=$5, wk=$6, wpts=$7, log=$8 where id=$1", [g.id, g.notice, Math.floor(g.exp), Math.floor(g.gold), JSON.stringify(g.chest), g.wk, Math.floor(g.wpts), JSON.stringify(g.log)]); }
      catch (e) { g.dirty = true; console.error("[guilda] gravar", e); }
    }
    if (g.md.size) {
      const ids = [...g.md]; g.md.clear();
      for (const id of ids) {
        const m = g.mem.get(id); if (!m) continue;
        try { await pool.query("update guild_members set name=$2, cls=$3, level=$4, role=$5, wpts=$6, tpts=$7, claimed=$8, seen=$9 where char_id=$1", [id, m.n, m.cls, m.lv, m.role, Math.floor(m.wpts), Math.floor(m.tpts), m.claimed, m.seen]); }
        catch (e) { g.md.add(id); console.error("[guilda] gravar membro", e); }
      }
    }
  } finally { g.fl = false; }
}
function unloadIfIdle(g: Guild) { if (![...g.mem.keys()].some((id) => ON.has(id))) { flush(g).finally(() => { if (![...g.mem.keys()].some((id) => ON.has(id))) G.delete(g.id); }); } }
async function tx<T>(fn: (q: any) => Promise<T>): Promise<T> {
  const cl = await pool.connect();
  try { await cl.query("begin"); const r = await fn(cl); await cl.query("commit"); return r; }
  catch (e) { try { await cl.query("rollback"); } catch { /* ignora */ } throw e; }
  finally { cl.release(); }
}

/* ---------- utilidades ---------- */
const rollWeek = (g: Guild) => {                                      // virou a semana (segunda 04:00): zera a contagem e os resgates
  const wk = R.weekKey(now()); if (g.wk === wk) return;
  g.wk = wk; g.wpts = 0; g.dirty = true;
  for (const m of g.mem.values()) { m.wpts = 0; m.claimed = 0; g.md.add(m.id); }
};
const active = (g: Guild) => Math.max(3, [...g.mem.values()].filter((m) => ON.has(m.id) || m.seen > now() - 7 * DAY).length);
const addLog = (g: Guild, m: string) => { g.log.push({ t: now(), m }); if (g.log.length > 60) g.log.splice(0, g.log.length - 60); g.dirty = true; };
const online = (g: Guild) => [...g.mem.keys()].map((id) => ON.get(id)).filter(Boolean) as { room: any; s: any }[];
const tell = (g: Guild, type: string, msg: any) => { for (const o of online(g)) o.s.client.send(type, msg); };
const say = (g: Guild, text: string, from = "") => tell(g, "chat", { kind: "gd", from, text, sys: from ? 0 : 1 });
const status = (g: Guild | null, id: string) => { const m = g && g.mem.get(id); return g && m ? { name: g.name, tag: g.tag, role: m.role, lv: lvOf(g) } : null; };
function pushStatus(g: Guild | null, id: string) {
  const o = ON.get(id); if (!o) return;
  const p = o.room.state.players.get(o.s.client.sessionId); if (p && p.gt !== (g ? g.tag : "")) p.gt = g ? g.tag : "";
  o.s.client.send("gs", status(g, id));
}
function syncAll(g: Guild) { for (const id of g.mem.keys()) pushStatus(g, id); }
/** aviso leve: a lista de membros/estado mudou (quem está com a janela aberta pede a guilda de novo) */
const ping = (g: Guild) => tell(g, "gu", 1);
const gfor = (id: string) => { const gid = OF.get(id); return gid ? G.get(gid) : undefined; };

export function snap(g: Guild, myId: string, chest = true) {
  rollWeek(g);
  const lv = lvOf(g), act = active(g), me = g.mem.get(myId)!;
  const mem = [...g.mem.values()].map((m) => {
    const o = ON.get(m.id);
    return { n: o ? o.s.c.name : m.n, cls: o ? o.s.c.cls : m.cls, lv: o ? o.s.c.level : m.lv, role: m.role, on: o ? 1 : 0, pts: m.wpts, seen: m.seen };
  }).sort((a, b) => b.role - a.role || b.on - a.on || b.pts - a.pts);
  return {
    name: g.name, tag: g.tag, lv, exp: g.exp, expCur: 4000 * (lv - 1) ** 2, expNext: lv >= R.GUILD.maxLv ? 0 : 4000 * lv ** 2,
    cap: R.guildCap(lv), notice: g.notice, gold: g.gold, chest: chest ? g.chest : null, chestCap: g.chest.length, role: me.role, mem, log: g.log.slice(-40).reverse(),
    wk: { pts: g.wpts, need: R.GTIERS.map((_: any, i: number) => R.guildNeed(i, act)), act, mine: me.wpts, min: R.GUILD.wkMin, claimed: me.claimed, left: Math.max(0, Math.floor((R.weekEnd(now()) - now()) / 1000)) },
  };
}

/** soma Pontos de Guilda a quem está em uma guilda (chamado nos abates, calabouços, chefes de mundo e missões) */
export function gpAdd(s: any, n: number) {
  const g = gfor(s.charId); if (!g || !(n > 0)) return;
  const m = g.mem.get(s.charId); if (!m) return;
  rollWeek(g);
  const lv0 = lvOf(g);
  m.wpts += n; m.tpts += n; g.wpts += n; g.exp += n; m.seen = now(); g.dirty = true; g.md.add(m.id);
  const lv1 = lvOf(g);
  if (lv1 > lv0) { fixChest(g); addLog(g, `A guilda subiu para o nível ${lv1}!`); say(g, `🏰 A guilda subiu para o <b>nível ${lv1}</b>! Mais vagas e mais espaço no baú.`);syncAll(g); }
}
/** missões diárias/semanais concluídas trazem { gp } na resposta; esta função soma e deixa passar */
export function gpFromOut(s: any, out: any[]) { for (const o of out) if (o && o.gp > 0) gpAdd(s, o.gp); }

/* ---------- entrada e saída do jogo ---------- */
export async function guildJoin(room: any, s: any) {
  rooms.add(room); ON.set(s.charId, { room, s });
  if (!timer) timer = setInterval(() => { for (const g of G.values()) { rollWeek(g); flush(g); } for (const [k, v] of INV) if (v.until < now()) INV.delete(k); }, 15_000);
  try {
    const r = await pool.query("select guild_id from guild_members where char_id=$1", [s.charId]);
    if (!r.rowCount || ON.get(s.charId)?.s !== s) return;
    const g = await load(r.rows[0].guild_id); if (!g) return;
    const m = g.mem.get(s.charId); if (!m) return;
    OF.set(s.charId, g.id); m.n = s.c.name; m.cls = s.c.cls; m.lv = s.c.level; m.seen = now(); g.md.add(m.id);
    pushStatus(g, s.charId);
    say(g, `${s.c.name} entrou no jogo.`); ping(g);
    if (g.notice) s.client.send("chat", { kind: "gd", from: "", text: `📌 Aviso da guilda: ${g.notice}`, sys: 1 });
  } catch (e) { console.error("[guilda] entrar", e); }
}
export function guildLeave(room: any, s: any) {
  const g = gfor(s.charId);
  ON.delete(s.charId); OF.delete(s.charId); INV.delete(s.charId);
  if (g) { const m = g.mem.get(s.charId); if (m) { m.lv = s.c.level; m.cls = s.c.cls; m.n = s.c.name; m.seen = now(); g.md.add(m.id); } ping(g); unloadIfIdle(g); }
}

/* ---------- chat da guilda ---------- */
/** "/g texto", "/gl texto" ou "/guilda texto": devolve true se a mensagem era do chat da guilda */
export function guildChat(s: any, text: string): boolean {
  const gp = /^\/gp\s+(\d{1,7})$/i.exec(text);                          // GM: soma Pontos de Guilda a si mesmo (teste/evento)
  if (gp && s.c.gm) { gpAdd(s, Number(gp[1])); s.client.send("chat", { kind: "sys", text: `+${gp[1]} PG` }); return true; }
  const mt = /^\/(?:g|gl|guilda)\s+([\s\S]+)$/i.exec(text); if (!mt) return false;
  const g = gfor(s.charId);
  if (!g) { s.client.send("chat", { kind: "sys", text: "Você não está em uma guilda." }); return true; }
  say(g, mt[1].slice(0, 200), s.c.name);
  return true;
}

/* ---------- mensagens do cliente ---------- */
export async function guildMsg(room: any, s: any, m: any) {
  const op = String(m.op || ""), id: string = s.charId;
  const reply = (o: any) => s.client.send("gr", { op, ...o });
  const fail = (msg: string) => reply({ ok: false, msg });
  if (s.gl) return fail("Aguarde a operação anterior.");
  s.gl = 1;
  try {
    const g0 = gfor(id), me = g0 && g0.mem.get(id);
    const full = (msg = "") => reply({ ok: true, msg, g: g0 ? snap(g0, id, !m.nc) : null });
    const needG = () => (g0 && me ? g0 : null);
    const byName = (g: Guild, name: string) => [...g.mem.values()].find((x) => (ON.get(x.id)?.s.c.name || x.n).toLowerCase() === String(name || "").toLowerCase());

    if (op === "info") return full();
    if (op === "top") {
      const rows = (await pool.query(`select g.name, g.tag, g.exp, (select count(*)::int from guild_members x where x.guild_id=g.id) as n, l.name as leader
        from guilds g left join guild_members l on l.guild_id=g.id and l.role=2 order by g.exp desc, g.id limit 15`)).rows;
      return reply({ ok: true, top: rows.map((r: any) => ({ name: r.name, tag: r.tag, lv: R.guildLv(Number(r.exp)), n: r.n, leader: r.leader || "" })) });
    }

    if (op === "create") {
      if (g0) return fail("Você já está em uma guilda.");
      if (!nearTab(room, s, ["guilda"])) return fail("Chegue perto da Escrivã da Guilda.");
      const name = String(m.name || "").trim().replace(/\s+/g, " "), tag = String(m.tag || "").trim().toUpperCase();
      if (!R.guildNameOk(name)) return fail(`Nome inválido: use ${R.GUILD.nmin} a ${R.GUILD.nmax} letras ou números (espaços simples permitidos).`);
      if (!R.guildTagOk(tag)) return fail(`Sigla inválida: ${R.GUILD.tmin} a ${R.GUILD.tmax} letras ou números.`);
      if (!s.c.gm && s.c.gold < R.GUILD.cost) return fail(`Fundar uma guilda custa ${R.GUILD.cost.toLocaleString("pt-BR")} de ouro.`);
      if (!s.c.gm) s.c.gold -= R.GUILD.cost;
      let gid = 0;
      try {
        gid = await tx(async (q) => {
          const chest = Array(R.guildChest(1)).fill(null);
          const r = await q.query("insert into guilds(name,tag,chest,wk,log) values($1,$2,$3,$4,$5) returning id", [name, tag, JSON.stringify(chest), R.weekKey(now()), JSON.stringify([{ t: now(), m: `${s.c.name} fundou a guilda.` }])]);
          await q.query("insert into guild_members(char_id,guild_id,account_id,name,cls,level,role,seen) values($1,$2,$3,$4,$5,$6,2,$7)", [id, r.rows[0].id, s.acc.id, s.c.name, s.c.cls, s.c.level, now()]);
          return r.rows[0].id as number;
        });
      } catch (e: any) {
        if (!s.c.gm) s.c.gold += R.GUILD.cost;
        if (e && e.code === "23505") return fail(/tag/.test(String(e.constraint)) ? "Essa sigla já está em uso." : /char|pkey/.test(String(e.constraint)) ? "Você já está em uma guilda." : "Já existe uma guilda com esse nome.");
        console.error("[guilda] criar", e); return fail("Erro ao criar a guilda. Tente de novo.");
      }
      const g = await load(gid); if (!g) return fail("Erro ao criar a guilda.");
      OF.set(id, gid); room.touch(s); room.sync(s); await room.save(s);
      room.res(s, [{ sfx: "questDone" }, { toast: `🏰 A guilda ${name} [${tag}] foi fundada!` }, { log: `<span style="color:#ffd27a">🏰 Você fundou a guilda <b>${name}</b> [${tag}]. Convide jogadores pela janela da guilda (tecla U).</span>` }]);
      console.log(`[guilda] ${s.c.name} fundou "${name}" [${tag}]`);
      pushStatus(g, id);
      return reply({ ok: true, msg: "Guilda fundada!", g: snap(g, id) });
    }

    const g = needG();
    if (!g || !me) return fail("Você não está em uma guilda.");
    rollWeek(g);
    const isOff = me.role >= 1, isLead = me.role >= 2;
    const live = () => reply({ ok: true, g: snap(g, id) });

    if (op === "invite") {
      if (!isOff) return fail("Só o líder e os oficiais convidam.");
      if (g.mem.size >= R.guildCap(lvOf(g))) return fail("A guilda está cheia. Suba o nível dela para ter mais vagas.");
      const t = [...ON.values()].find((o) => String(o.s.c.name).toLowerCase() === String(m.name || "").toLowerCase());
      if (!t) return fail(`"${String(m.name || "").slice(0, 16)}" não está online.`);
      if (t.s === s) return fail("Você já faz parte da guilda.");
      if (OF.has(t.s.charId)) return fail("Esse jogador já está em uma guilda.");
      INV.set(t.s.charId, { gid: g.id, by: s.c.name, until: now() + 60_000 });
      t.s.client.send("ginv", { name: g.name, tag: g.tag, by: s.c.name });
      return reply({ ok: true, msg: `Convite enviado para ${t.s.c.name}.` });
    }
    if (op === "leave") {
      if (isLead) return fail(g.mem.size > 1 ? "Passe a liderança para outro membro antes de sair." : "Você é o único membro: dissolva a guilda se quiser encerrá-la.");
      g.mem.delete(id); OF.delete(id);
      await pool.query("delete from guild_members where char_id=$1", [id]);
      addLog(g, `${s.c.name} saiu da guilda.`); say(g, `${s.c.name} saiu da guilda.`); ping(g); await flush(g); unloadIfIdle(g);
      pushStatus(null, id); room.res(s, [{ toast: "Você saiu da guilda." }]);
      return reply({ ok: true, msg: "Você saiu da guilda.", g: null });
    }
    if (op === "kick" || op === "promote" || op === "demote" || op === "leader") {
      const t = byName(g, m.name);
      if (!t) return fail("Membro não encontrado.");
      if (t.id === id) return fail("Escolha outro membro.");
      const tn = ON.get(t.id)?.s.c.name || t.n;
      if (op === "kick") {
        if (!isOff || t.role >= me.role) return fail("Você não pode expulsar esse membro.");
        g.mem.delete(t.id); OF.delete(t.id);
        await pool.query("delete from guild_members where char_id=$1", [t.id]);
        addLog(g, `${tn} foi expulso por ${s.c.name}.`); say(g, `${tn} foi expulso da guilda.`); ping(g);
        const o = ON.get(t.id); if (o) { o.s.client.send("chat", { kind: "sys", text: "Você foi expulso da guilda." }); pushStatus(null, t.id); }
        await flush(g); return live();
      }
      if (!isLead) return fail("Só o líder faz isso.");
      if (op === "promote") { if (t.role !== 0) return fail("Esse membro já é oficial."); t.role = 1; addLog(g, `${tn} foi promovido a oficial.`); say(g, `${tn} agora é oficial.`); }
      else if (op === "demote") { if (t.role !== 1) return fail("Esse membro não é oficial."); t.role = 0; addLog(g, `${tn} voltou a ser membro.`); say(g, `${tn} voltou a ser membro.`); }
      else { t.role = 2; me.role = 1; addLog(g, `${tn} é o novo líder (antes ${s.c.name}).`); say(g, `👑 ${tn} é o novo líder da guilda.`); }
      g.md.add(t.id); g.md.add(id); syncAll(g); await flush(g); return live();
    }
    if (op === "notice") {
      if (!isOff) return fail("Só o líder e os oficiais mudam o aviso.");
      g.notice = String(m.text || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120); g.dirty = true;
      say(g, g.notice ? `📌 Novo aviso: ${g.notice}` : "📌 O aviso da guilda foi removido."); await flush(g); return live();
    }
    if (op === "disband") {
      if (!isLead) return fail("Só o líder dissolve a guilda.");
      if (g.mem.size > 1) return fail("Expulse os outros membros antes de dissolver a guilda.");
      if (g.gold > 0 || g.chest.some(Boolean)) return fail("Esvazie o baú e o cofre de ouro antes de dissolver a guilda.");
      await pool.query("delete from guilds where id=$1", [g.id]);
      G.delete(g.id); OF.delete(id); pushStatus(null, id);
      room.res(s, [{ toast: "A guilda foi dissolvida." }]);
      return reply({ ok: true, msg: "A guilda foi dissolvida.", g: null });
    }

    /* baú e cofre: ficam no salão da guilda — é preciso estar perto da Escrivã (ou do Baú da cidade) */
    if (op === "dep" || op === "wd") {
      if (!nearTab(room, s, ["guilda", "bau"])) return fail("Chegue perto da Escrivã da Guilda (ou do Baú) para usar o baú da guilda.");
      if (op === "dep") {
        const i = Number(m.i), it = Number.isInteger(i) ? s.c.inv[i] : null;
        if (!it || !tradeable(it)) return fail("Esse item não pode ir para o baú.");
        const q = it.k === "eq" ? 1 : Math.max(1, Math.min(it.n, Math.floor(Number(m.q) || it.n)));
        if (!fits(g.chest, proto(it), q)) return fail("O baú da guilda está cheio.");
        const label = nm(it.k === "eq" ? it : { ...it, n: q });
        for (const c of chunks(it.k === "eq" ? it : proto(it), q)) R.addItem(g.chest, it.k === "eq" ? it : c);
        if (it.k === "eq") s.c.inv[i] = null; else { it.n -= q; if (it.n <= 0) s.c.inv[i] = null; }
        addLog(g, `${s.c.name} guardou ${label}.`); g.dirty = true; await flush(g); room.touch(s); room.sync(s); await room.save(s);
        return live();
      }
      if (!isOff) return fail("Só o líder e os oficiais retiram itens do baú.");
      const j = Number(m.j), it = Number.isInteger(j) ? g.chest[j] : null;
      if (!it) return fail("Esse espaço do baú está vazio.");
      const q = it.k === "eq" ? 1 : Math.max(1, Math.min(it.n, Math.floor(Number(m.q) || it.n)));
      if (!fits(s.c.inv, proto(it), q)) return fail("Mochila cheia!");
      const label = nm(it.k === "eq" ? it : { ...it, n: q });
      if (it.k === "eq") { R.addItem(s.c.inv, it); g.chest[j] = null; }
      else { for (const c of chunks(proto(it), q)) R.addItem(s.c.inv, c); it.n -= q; if (it.n <= 0) g.chest[j] = null; }
      addLog(g, `${s.c.name} retirou ${label}.`); g.dirty = true; await flush(g); room.touch(s); room.sync(s); await room.save(s);
      return live();
    }
    if (op === "dgold" || op === "wgold") {
      if (!nearTab(room, s, ["guilda", "bau"])) return fail("Chegue perto da Escrivã da Guilda para mexer no cofre.");
      const n = Math.floor(Number(m.n));
      if (!Number.isSafeInteger(n) || n < 1) return fail("Valor inválido.");
      if (op === "dgold") {
        if (s.c.gm) return fail("Contas de GM não depositam ouro.");
        if (s.c.gold < n) return fail("Você não tem esse ouro.");
        s.c.gold -= n; g.gold += n; addLog(g, `${s.c.name} depositou ${n.toLocaleString("pt-BR")} de ouro.`);
      } else {
        if (!isLead) return fail("Só o líder retira ouro do cofre.");
        if (g.gold < n) return fail("O cofre não tem esse ouro.");
        g.gold -= n; if (!s.c.gm) s.c.gold += n; addLog(g, `${s.c.name} retirou ${n.toLocaleString("pt-BR")} de ouro.`);
      }
      g.dirty = true; await flush(g); room.touch(s); room.sync(s); await room.save(s);
      room.res(s, [{ sfx: "coin" }]);
      return live();
    }

    /* prêmio coletivo da semana: cada faixa atingida pode ser resgatada uma vez por quem contribuiu o mínimo */
    if (op === "claim") {
      const t = Math.floor(Number(m.tier));
      if (!(t >= 0 && t < R.GTIERS.length)) return fail("Faixa inválida.");
      if (g.wpts < R.guildNeed(t, active(g))) return fail("A guilda ainda não atingiu essa faixa nesta semana.");
      if (me.wpts < R.GUILD.wkMin) return fail(`Contribua com pelo menos ${R.GUILD.wkMin} PG nesta semana para resgatar prêmios.`);
      if (me.claimed & (1 << t)) return fail("Você já resgatou essa faixa.");
      const pr = R.guildPrize(s.c, t);
      me.claimed |= 1 << t;
      try {
        await tx(async (q) => {
          await q.query("update guild_members set claimed=$2 where char_id=$1", [id, me.claimed]);
          await sendMail(s.acc.id, { kind: "guild", title: `🏰 Prêmio da Guilda — ${R.GTIERS[t].n}`, body: `Prêmio coletivo da semana — guilda ${g.name}.`, gold: pr.gold, items: toMail(pr.items) }, q);
        });
      } catch (e) { me.claimed &= ~(1 << t); console.error("[guilda] prêmio", e); return fail("Erro ao enviar o prêmio. Tente de novo."); }
      mailNotify(room, s.acc.id);
      room.res(s, [{ sfx: "questDone" }, { toast: `${R.GTIERS[t].i} Prêmio ${R.GTIERS[t].n} da guilda enviado ao Correio!` }]);
      return reply({ ok: true, msg: "Prêmio enviado ao Correio.", g: snap(g, id) });
    }
    return fail("Operação desconhecida.");
  } catch (e) { console.error("[guilda]", e); return fail("Erro na guilda. Tente de novo."); }
  finally { s.gl = 0; }
}

/** resposta ao convite recebido (ginv) */
export async function guildAnswer(room: any, s: any, m: any) {
  const id: string = s.charId, iv = INV.get(id); INV.delete(id);
  if (!iv || iv.until < now()) return;
  try {
    const g = await load(iv.gid); if (!g) return;
    if (!m?.ok) { const by = [...ON.values()].find((o) => o.s.c.name === iv.by); by?.s.client.send("chat", { kind: "sys", text: `${s.c.name} recusou o convite da guilda.` }); return; }
    if (OF.has(id)) return s.client.send("chat", { kind: "sys", text: "Você já está em uma guilda." });
    if (g.mem.size >= R.guildCap(lvOf(g))) return s.client.send("chat", { kind: "sys", text: "A guilda está cheia." });
    await pool.query("insert into guild_members(char_id,guild_id,account_id,name,cls,level,role,seen) values($1,$2,$3,$4,$5,$6,0,$7)", [id, g.id, s.acc.id, s.c.name, s.c.cls, s.c.level, now()]);
    g.mem.set(id, { id, acc: s.acc.id, n: s.c.name, cls: s.c.cls, lv: s.c.level, role: 0, wpts: 0, tpts: 0, claimed: 0, seen: now() });
    OF.set(id, g.id); addLog(g, `${s.c.name} entrou na guilda.`); say(g, `🎉 ${s.c.name} entrou na guilda!`); ping(g); await flush(g);
    pushStatus(g, id); s.client.send("gr", { op: "info", ok: true, g: snap(g, id) });
    room.res(s, [{ sfx: "questAccept" }, { toast: `🏰 Você entrou na guilda ${g.name}!` }]);
  } catch (e) { console.error("[guilda] convite", e); }
}

/** personagem apagado: sai da guilda (o líder passa o cargo para o oficial/membro mais antigo; se era o último, a guilda é encerrada) */
export async function guildCharDeleted(charId: string) {
  try {
    const r = await pool.query("select guild_id from guild_members where char_id=$1", [charId]);
    if (!r.rowCount) return;
    const g = await load(r.rows[0].guild_id); if (!g) return;
    const m = g.mem.get(charId); if (!m) return;
    g.mem.delete(charId); OF.delete(charId); ON.delete(charId);
    await pool.query("delete from guild_members where char_id=$1", [charId]);
    if (!g.mem.size) { await pool.query("delete from guilds where id=$1", [g.id]); G.delete(g.id); return; }
    if (m.role === 2) { const nx = [...g.mem.values()].sort((a, b) => b.role - a.role || a.seen - b.seen)[0]; nx.role = 2; g.md.add(nx.id); addLog(g, `${nx.n} é o novo líder.`); }
    addLog(g, `${m.n} saiu da guilda.`); await flush(g); syncAll(g); unloadIfIdle(g);
  } catch (e) { console.error("[guilda] personagem apagado", e); }
}

export function guildDispose(room: any) { rooms.delete(room); if (!rooms.size) { if (timer) clearInterval(timer); timer = undefined; for (const g of G.values()) flush(g); } }
