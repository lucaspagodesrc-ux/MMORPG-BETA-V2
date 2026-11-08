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
  app.get("/health", async (_q, r) => { await pool.query("select 1"); r.json({ ok: true }); });
  app.get("/api/online", async (_q, r) => { const rooms = await matchMaker.query({ name: "world" }); r.json({ rooms: rooms.length, players: rooms.reduce((n: number, x: any) => n + x.clients, 0) }); });
  app.use("/api", authRouter);
  app.get("/colyseus-client/colyseus.js", (_q, r) => r.sendFile(path.join(__dirname, "colyseus-browser.js")));
  app.get(["/", "/index.html"], (_q, r) => r.sendFile(path.join(__dirname, "index.html")));
  // Música do jogo: coloque o arquivo "tema.mp3" na mesma pasta do index.html (veja o README).
  // Sem o arquivo, o jogo toca uma trilha ambiente provisória.
  const musicFile = path.join(__dirname, "tema.mp3");
  app.get("/audio/tema.mp3", (_q, r) => {
    if (!fs.existsSync(musicFile)) { r.status(404).end(); return; }
    r.sendFile(musicFile, { maxAge: "1d" });
  });

  const server = http.createServer(app);
  const game = new Server({ transport: new WebSocketTransport({ server }) });
  game.define("world", WorldRoom);
  const port = Number(process.env.PORT) || 3000;
  await game.listen(port);
  console.log(`Servidor no ar: http://localhost:${port}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
