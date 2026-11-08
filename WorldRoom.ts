import { Room, Client, ServerError } from "colyseus";
import { WorldState, Player } from "./schema";
import { verifyToken, getCharacter, AuthUser } from "./auth";

const MAP = 80;          // mesmo limite do cliente
const RATE = 14;         // unidades/s sustentadas (jogador anda ~6-8)
const BURST = 20;        // folga para habilidades de avanço (ex.: Investida)
const clamp = (v: number) => Math.max(-MAP, Math.min(MAP, v));
// O mundo tem duas regiões de 160x160: a Vila Aurora (centro x=0) e Solara (centro x=300).
const cx = (x: number) => (x > 150 ? 300 : 0);
const clampX = (x: number, ref: number) => Math.max(cx(ref) - MAP, Math.min(cx(ref) + MAP, x));
const SOLARA_MIN_LEVEL = 50;
const PORTALS: Record<string, { x: number; z: number; to: { x: number; z: number }; minLevel: number }> = {
  portal_a: { x: 14, z: 56, to: { x: 300, z: -7 }, minLevel: SOLARA_MIN_LEVEL },   // depois da Ponte do Rio Cristalino -> Solara
  portal_b: { x: 300, z: -11, to: { x: 14, z: 52 }, minLevel: 0 },                  // Solara -> Vila Aurora
};

type Meta = { acc: AuthUser; t: number; budget: number; lastChat: number; lastRecall: number; lastPortal: number; lastRevive: number };
const TOWNS = [{ x: 0, z: 5 }, { x: 300, z: 5 }];   // cidades (mesmas do cliente); o servidor escolhe a mais próxima

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
      let x = clampX(m.x, p.x), z = clamp(m.z);   // não dá para cruzar de região andando: só pelo portal
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d > mt.budget) {                       // rápido demais: limita e corrige o cliente
        const k = mt.budget / d;
        x = p.x + dx * k; z = p.z + dz * k;
        mt.budget = 0;
        client.send("correct", { x, z });
      } else mt.budget -= d;
      p.x = x; p.z = z;
    });

    this.onMessage("recall", (client) => {       // teleporte para a cidade mais próxima (sem aceitar coordenadas do cliente)
      const p = this.state.players.get(client.sessionId), mt = this.meta.get(client.sessionId);
      if (!p || !mt) return;
      const now = Date.now();
      if (now - mt.lastRecall < 10_000) return;
      mt.lastRecall = now;
      const t = TOWNS.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      p.x = t.x; p.z = t.z; mt.budget = BURST; mt.t = now;
    });

    this.onMessage("portal", (client, m) => {    // portais entre a Vila Aurora e Solara
      const p = this.state.players.get(client.sessionId), mt = this.meta.get(client.sessionId);
      const g = PORTALS[String(m?.id)];
      if (!p || !mt || !g) return;
      const now = Date.now();
      if (now - mt.lastPortal < 1500) return;
      if (Math.hypot(p.x - g.x, p.z - g.z) > 9) return;              // precisa estar perto do portal
      if (p.level < g.minLevel) { client.send("chat", { kind: "sys", text: `O portal só abre a partir do nível ${g.minLevel}.` }); return; }
      mt.lastPortal = now;
      p.x = g.to.x; p.z = g.to.z; mt.budget = BURST; mt.t = now;
    });

    this.onMessage("revive", (client) => {       // ressurreição na cidade mais próxima
      const p = this.state.players.get(client.sessionId), mt = this.meta.get(client.sessionId);
      if (!p || !mt) return;
      const now = Date.now();
      if (now - mt.lastRevive < 8_000) return;
      mt.lastRevive = now;
      const t = TOWNS.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      p.x = t.x; p.z = t.z; mt.budget = BURST; mt.t = now;
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
    const ox = Number.isFinite(options?.x) ? options.x : 0;
    p.x = clampX(ox, ox);
    p.z = Number.isFinite(options?.z) ? clamp(options.z) : 5;
    if (p.x > 150 && p.level < SOLARA_MIN_LEVEL) { p.x = 0; p.z = 5; }      // quem não tem nível para Solara volta à Vila
    this.state.players.set(client.sessionId, p);
    this.meta.set(client.sessionId, { acc: auth.acc, t: Date.now(), budget: BURST, lastChat: 0, lastRecall: 0, lastPortal: 0, lastRevive: 0 });
    this.broadcast("chat", { kind: "sys", text: `${p.name} entrou no mundo.` }, { except: client });
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) this.broadcast("chat", { kind: "sys", text: `${p.name} saiu do mundo.` }, { except: client });
    this.state.players.delete(client.sessionId);
    this.meta.delete(client.sessionId);
  }
}
