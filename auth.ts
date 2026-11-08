import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Router, Request, Response, NextFunction } from "express";
import { pool } from "./db";

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

authRouter.get("/account", authed, async (req, res) => {
  const u = (req as any).user as AuthUser;
  const [c, a] = await Promise.all([
    pool.query("select data from characters where account_id=$1 order by updated_at", [u.id]),
    pool.query("select stash from accounts where id=$1", [u.id]),
  ]);
  res.json({ username: u.username, chars: c.rows.map((x) => x.data), stash: a.rows[0]?.stash || [] });
});

// Validação básica de formato. A validação de regras (XP, ouro, drops) virá com o servidor autoritativo.
const validChar = (c: any) =>
  c && typeof c.id === "string" && c.id.length <= 40 && typeof c.name === "string" && c.name.length >= 1 && c.name.length <= 16 &&
  CLASSES.includes(c.cls) && Number.isInteger(c.level) && c.level >= 1 && c.level <= 200 &&
  typeof c.gold === "number" && c.gold >= 0 && JSON.stringify(c).length < 64_000;

authRouter.put("/account", authed, async (req, res) => {
  const u = (req as any).user as AuthUser;
  const { chars, stash } = req.body || {};
  if (!Array.isArray(chars) || chars.length > 6 || !chars.every(validChar) || !Array.isArray(stash) || stash.length > 40)
    return res.status(400).json({ error: "Dados inválidos." });
  const cl = await pool.connect();
  try {
    await cl.query("begin");
    await cl.query("delete from characters where account_id=$1 and not (id = any($2::text[]))", [u.id, chars.map((c: any) => c.id)]);
    for (const c of chars) {
      await cl.query(
        `insert into characters(id,account_id,name,class,level,data) values($1,$2,$3,$4,$5,$6)
         on conflict (id) do update set name=$3,class=$4,level=$5,data=$6,updated_at=now() where characters.account_id=$2`,
        [c.id, u.id, c.name, c.cls, c.level, c]
      );
    }
    await cl.query("update accounts set stash=$2 where id=$1", [u.id, JSON.stringify(stash)]);
    await cl.query("commit");
    res.json({ ok: true });
  } catch (e) {
    await cl.query("rollback").catch(() => {});
    console.error(e);
    res.status(500).json({ error: "Erro ao salvar." });
  } finally {
    cl.release();
  }
});

export async function getCharacter(accountId: number, charId: string) {
  const r = await pool.query("select name,class,level from characters where id=$1 and account_id=$2", [charId, accountId]);
  return r.rows[0] as { name: string; class: string; level: number } | undefined;
}
