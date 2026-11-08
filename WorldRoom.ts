import { Room, Client, ServerError } from "colyseus";
import { WorldState, Player } from "./schema";
import { verifyToken, getCharacter, AuthUser } from "./auth";

const MAP = 80;          // mesmo limite do cliente
const RATE = 14;         // unidades/s sustentadas (jogador anda ~6-8)
const BURST = 20;        // folga para habilidades de avanço (ex.: Investida)
const clamp = (v: number) => Math.max(-MAP, Math.min(MAP, v));

type Meta = { acc: AuthUser; t: number; budget: number; lastChat: number };

export class WorldRoom extends Room<WorldState> {
  maxClients = 100;
  private meta = new Map<string, Meta>();

  onCreate() {
    this.setState(new WorldState());
    this.setPatchRate(50);

    this.onMessage("move", (client, m) => {
      const p = this.state.players.get(client.sessionId), mt = this.meta.get(client.sessionId);
      if (!p || !mt || !Number.isFinite(m?.x) || !Number.isFinite(m?.z)) return;
      const now = Date.now();
      mt.budget = Math.min(BURST, mt.budget + ((now - mt.t) / 1000) * RATE);
      mt.t = now;
      let x = clamp(m.x), z = clamp(m.z);
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d > mt.budget) {                       // rápido demais: limita e corrige o cliente
        const k = mt.budget / d;
        x = p.x + dx * k; z = p.z + dz * k;
        mt.budget = 0;
        client.send("correct", { x, z });
      } else mt.budget -= d;
      p.x = x; p.z = z;
    });

    this.onMessage("info", (client, m) => {      // apenas exibição; o servidor autoritativo virá na fase 3
      const p = this.state.players.get(client.sessionId);
      if (p && Number.isInteger(m?.level) && m.level >= 1 && m.level <= 200) p.level = m.level;
    });

    this.onMessage("chat", (client, m) => {
      const p = this.state.players.get(client.sessionId), mt = this.meta.get(client.sessionId);
      if (!p || !mt || typeof m?.text !== "string") return;
      const now = Date.now();
      if (now - mt.lastChat < 700) return;
      mt.lastChat = now;
      const text = m.text.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200);
      if (!text) return;
      const w = /^\/w\s+(\S+)\s+([\s\S]+)$/i.exec(text);
      if (w) {
        const target = this.clients.find((c) => this.state.players.get(c.sessionId)?.name.toLowerCase() === w[1].toLowerCase());
        if (!target) return client.send("chat", { kind: "sys", text: `Jogador "${w[1]}" não está online.` });
        const msg = { kind: "w", from: p.name, text: w[2] };
        target.send("chat", msg);
        if (target !== client) client.send("chat", { ...msg, from: `para ${w[1]}` });
        return;
      }
      this.broadcast("chat", { kind: "g", from: p.name, text });
    });
  }

  async onAuth(_c: Client, options: any) {
    const acc = verifyToken(options?.token);
    if (!acc) throw new ServerError(401, "Sessão inválida.");
    const ch = await getCharacter(acc.id, String(options?.charId || ""));
    if (!ch) throw new ServerError(404, "Personagem não encontrado.");
    return { acc, ch };
  }

  onJoin(client: Client, options: any, authData?: any) {
    const auth = authData as { acc: AuthUser; ch: { name: string; class: string; level: number } };
    for (const [sid, mt] of this.meta)           // uma sessão por conta
      if (mt.acc.id === auth.acc.id) this.clients.find((c) => c.sessionId === sid)?.leave(4001);
    const p = new Player();
    p.name = auth.ch.name; p.cls = auth.ch.class; p.level = auth.ch.level;
    p.x = Number.isFinite(options?.x) ? clamp(options.x) : 0;
    p.z = Number.isFinite(options?.z) ? clamp(options.z) : 5;
    this.state.players.set(client.sessionId, p);
    this.meta.set(client.sessionId, { acc: auth.acc, t: Date.now(), budget: BURST, lastChat: 0 });
    this.broadcast("chat", { kind: "sys", text: `${p.name} entrou no mundo.` }, { except: client });
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) this.broadcast("chat", { kind: "sys", text: `${p.name} saiu do mundo.` }, { except: client });
    this.state.players.delete(client.sessionId);
    this.meta.delete(client.sessionId);
  }
}
