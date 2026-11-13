import express from "express";
import compression from "compression";
import http from "http";
import fs from "fs";
import path from "path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { migrate, pool } from "./db";
import { authRouter } from "./auth";
import { WorldRoom } from "./WorldRoom";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL (veja .env.example).");
  await migrate();

  const app = express();
  app.set("trust proxy", 1);
  // v1.67: respostas comprimidas (gzip) — a página cai de ~750 KB para ~180 KB
  app.use(compression());
  // v1.67: a página do jogo pode ficar em outro site (Cloudflare Pages). ALLOWED_ORIGINS = lista separada por vírgula
  // (ex.: https://meujogo.pages.dev). Vazio = aceita qualquer origem (o login usa token no cabeçalho, sem cookies).
  const ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  app.use((q, r, next) => {
    const o = String(q.headers.origin || "");
    if (o && (!ORIGINS.length || ORIGINS.includes(o))) {
      r.set("Access-Control-Allow-Origin", o); r.set("Vary", "Origin");
      r.set("Access-Control-Allow-Headers", "Content-Type, Authorization"); r.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    }
    if (q.method === "OPTIONS") { r.status(204).end(); return; }
    next();
  });
  app.use(express.json({ limit: "512kb" }));
  // configuração da página quando ela é servida por este próprio servidor (mesmo endereço)
  app.get("/config.js", (_q, r) => r.type("application/javascript").set("Cache-Control", "no-cache").send("window.GAME_SERVER=window.GAME_SERVER||'';"));
  app.get("/health", async (_q, r) => { await pool.query("select 1"); r.json({ ok: true, t: Date.now(), v: 4 }); });
  app.get("/rules.js", (_q, r) => r.set("Cache-Control", "no-cache").sendFile(path.join(__dirname, "rules.js")));
  app.get("/api/online", async (_q, r) => { const rooms = await matchMaker.query({ name: "world" }); r.json({ rooms: rooms.length, players: rooms.reduce((n: number, x: any) => n + x.clients, 0) }); });
  app.use("/api", authRouter);
  app.get("/colyseus-client/colyseus.js", (_q, r) => r.sendFile(path.join(__dirname, "colyseus-browser.js")));
  // v1.65: modelos 3D (arquivos .glb na mesma pasta do index.html, ex.: cavaleiro.glb) — ficam em cache no navegador por 1 dia
  app.get("/modelos/:f", (q, r) => {
    const f = String(q.params.f || "");
    if (!/^[a-z0-9_-]+\.glb$/i.test(f)) { r.status(404).end(); return; }
    const file = path.join(__dirname, f);
    if (!fs.existsSync(file)) { r.status(404).end(); return; }
    r.type("model/gltf-binary").sendFile(file, { maxAge: "1d" });
  });
  app.get(["/", "/index.html"], (_q, r) => r.set("Cache-Control", "no-cache").sendFile(path.join(__dirname, "index.html")));
  // Música do jogo: qualquer arquivo .mp3 na mesma pasta do index.html (de preferência "tema.mp3"; veja o README).
  // Sem arquivo, o jogo toca uma trilha ambiente provisória.
  const findMusic = (): string | null => {
    try {
      const mp3s = fs.readdirSync(__dirname).filter((f) => f.toLowerCase().endsWith(".mp3"));
      const f = mp3s.find((n) => n.toLowerCase() === "tema.mp3") || mp3s[0];
      return f ? path.join(__dirname, f) : null;
    } catch { return null; }
  };
  app.get("/audio/tema.mp3", (_q, r) => {
    const file = findMusic();
    if (!file) { r.status(404).type("text/plain").send("Nenhum arquivo .mp3 encontrado na pasta do servidor."); return; }
    r.type("audio/mpeg").sendFile(file, { maxAge: "1d" });
  });

  const server = http.createServer(app);
  // v1.67: mensagens do jogo comprimidas (permessage-deflate) — corta bastante o tráfego de saída
  const game = new Server({ transport: new WebSocketTransport({ server, perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 3 } } } as any) });
  game.define("world", WorldRoom);
  const port = Number(process.env.PORT) || 3000;
  await game.listen(port);
  console.log(`Servidor no ar: http://localhost:${port}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
