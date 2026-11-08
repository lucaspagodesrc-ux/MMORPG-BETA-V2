import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Router, Request, Response, NextFunction } from "express";
import { pool } from "./db";
const R: any = require("./rules.js");

const SECRET =
  process.env.JWT_SECRET ||
  (() => {
    if (process.env.NODE_ENV === "production") throw new Error("Defina a variável JWT_SECRET.");
    console.warn("JWT_SECRET ausente: usando segredo aleatório de desenvolvimento.");
    return crypto.randomBytes(32).toString("hex");
  })();

export const CLASSES = ["guerreiro", "arqueiro", "mago", "assassino", "cavaleiro"];
export type AuthUser = { id: number; username: string };

export const signToken = (u: AuthUser) => jwt.sign({ id: u.id, username: u.username }, SECRET, { expiresIn: "30d" });
export function verifyToken(t: unknown): AuthUser | null {
  try {
    const p = jwt.verify(String(t), SECRET) as AuthUser;
    return p && typeof p.id === "number" ? p : null;
  } catch {
    return null;
  }
}

// Limite simples de tentativas por IP (em memória).
const hits = new Map<string, { n: number; reset: number }>();
function limit(req: Request, res: Response, next: NextFunction) {
  const k = req.ip || "?", now = Date.now();
  let h = hits.get(k);
  if (!h || now > h.reset) hits.set(k, (h = { n: 0, reset: now + 10 * 60_000 }));
  if (++h.n > 30) return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
  next();
}

function authed(req: Request, res: Response, next: NextFunction) {
  const u = verifyToken((req.headers.authorization || "").replace(/^Bearer /, ""));
  if (!u) return res.status(401).json({ error: "Sessão expirada. Entre novamente." });
  (req as any).user = u;
  next();
}

const DUMMY = bcrypt.hashSync("dummy-password", 10);
export const authRouter = Router();

authRouter.post("/register", limit, async (req, res) => {
  const { username, password } = req.body || {};
  if (!/^[A-Za-z0-9_]{3,20}$/.test(String(username))) return res.status(400).json({ error: "Usuário: 3 a 20 letras, números ou _." });
  if (typeof password !== "string" || password.length < 6 || password.length > 72) return res.status(400).json({ error: "A senha deve ter de 6 a 72 caracteres." });
  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query("insert into accounts(username,pass_hash) values($1,$2) returning id,username", [username, hash]);
    res.json({ token: signToken(r.rows[0]) });
  } catch (e: any) {
    if (e.code === "23505") return res.status(409).json({ error: "Esse usuário já existe." });
    console.error(e);
    res.status(500).json({ error: "Erro no servidor." });
  }
});

authRouter.post("/login", limit, async (req, res) => {
  const { username, password } = req.body || {};
  const r = await pool.query("select id,username,pass_hash from accounts where lower(username)=lower($1)", [String(username || "")]);
  const row = r.rows[0];
  const ok = await bcrypt.compare(String(password || ""), row ? row.pass_hash : DUMMY);
  if (!row || !ok) return res.status(401).json({ error: "Usuário ou senha inválidos." });
  res.json({ token: signToken({ id: row.id, username: row.username }) });
});

// Lista os personagens da conta. Personagens antigos são ajustados às regras novas (nunca apagados).
authRouter.get("/account", authed, async (req, res) => {
  const u = (req as any).user as AuthUser;
  const [c, a] = await Promise.all([
    pool.query("select id,data from characters where account_id=$1 order by updated_at", [u.id]),
    pool.query("select stash from accounts where id=$1", [u.id]),
  ]);
  const chars: any[] = [];
  for (const row of c.rows) {
    const d = row.data || {};
    const old = d.v !== R.VERSION;
    try {
      const ch = R.migrate(d);
      if (old) await saveChar(u.id, ch);
      chars.push(ch);
    } catch (e) { console.error("migrate", row.id, e); chars.push(d); }
  }
  const st0 = a.rows[0]?.stash || [];
  const stash = R.migrateStash(st0);
  if (JSON.stringify(st0) !== JSON.stringify(stash)) await saveStash(u.id, stash);
  res.json({ username: u.username, chars, stash });
});

authRouter.post("/chars", authed, async (req, res) => {
  const u = (req as any).user as AuthUser;
  const { cls, name } = req.body || {};
  const nm = String(name || "").replace(/[\u0000-\u001f<>&"]/g, "").trim();
  if (!CLASSES.includes(cls)) return res.status(400).json({ error: "Classe inválida." });
  if (nm.length < 1 || nm.length > 16) return res.status(400).json({ error: "Nome: 1 a 16 caracteres." });
  const n = await pool.query("select count(*)::int as n from characters where account_id=$1", [u.id]);
  if (n.rows[0].n >= 6) return res.status(400).json({ error: "Limite de 6 personagens." });
  const c = R.newChar(cls, nm);
  await saveChar(u.id, c);
  res.json({ char: c });
});

authRouter.delete("/chars/:id", authed, async (req, res) => {
  const u = (req as any).user as AuthUser;
  await pool.query("delete from characters where id=$1 and account_id=$2", [String(req.params.id), u.id]);
  res.json({ ok: true });
});

export async function saveChar(accountId: number, c: any) {
  await pool.query(
    `insert into characters(id,account_id,name,class,level,data) values($1,$2,$3,$4,$5,$6)
     on conflict (id) do update set name=$3,class=$4,level=$5,data=$6,updated_at=now() where characters.account_id=$2`,
    [c.id, accountId, c.name, c.cls, c.level, c]
  );
}
export async function saveStash(accountId: number, stash: any[]) {
  await pool.query("update accounts set stash=$2 where id=$1", [accountId, JSON.stringify(stash)]);
}
export async function loadCharacter(accountId: number, charId: string) {
  const r = await pool.query("select data from characters where id=$1 and account_id=$2", [charId, accountId]);
  return r.rows[0] ? R.migrate(r.rows[0].data) : undefined;
}
export async function loadStash(accountId: number) {
  const r = await pool.query("select stash from accounts where id=$1", [accountId]);
  return R.migrateStash(r.rows[0]?.stash || []);
}
