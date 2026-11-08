import express from "express";
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
  app.use(express.json({ limit: "512kb" }));
  app.get("/health", async (_q, r) => { await pool.query("select 1"); r.json({ ok: true, t: Date.now(), v: 4 }); });
  app.get("/rules.js", (_q, r) => r.set("Cache-Control", "no-cache").sendFile(path.join(__dirname, "rules.js")));
  app.get("/api/online", async (_q, r) => { const rooms = await matchMaker.query({ name: "world" }); r.json({ rooms: rooms.length, players: rooms.reduce((n: number, x: any) => n + x.clients, 0) }); });
  app.use("/api", authRouter);
  app.get("/colyseus-client/colyseus.js", (_q, r) => r.sendFile(path.join(__dirname, "colyseus-browser.js")));
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
  const game = new Server({ transport: new WebSocketTransport({ server }) });
  game.define("world", WorldRoom);
  const port = Number(process.env.PORT) || 3000;
  await game.listen(port);
  console.log(`Servidor no ar: http://localhost:${port}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
