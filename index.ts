import express from "express";
import http from "http";
import path from "path";
import { Server } from "colyseus";
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
  app.use("/api", authRouter);
  app.use("/colyseus-client", express.static(path.join(__dirname, "./node_modules/colyseus.js/dist")));
  app.get(["/", "/index.html"], (_q, r) => r.sendFile(path.join(__dirname, "index.html")));

  const server = http.createServer(app);
  const game = new Server({ transport: new WebSocketTransport({ server }) });
  game.define("world", WorldRoom);
  const port = Number(process.env.PORT) || 3000;
  await game.listen(port);
  console.log(`Servidor no ar: http://localhost:${port}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
