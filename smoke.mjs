// Teste de fumaça: cria 2 contas, salva personagens, entra na sala e confere se um enxerga o outro.
import { Client } from "colyseus.js";
const base = process.env.URL || "http://localhost:3000";
const post = async (p, b, t, m = "POST") => (await fetch(base + "/api/" + p, { method: m, headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: JSON.stringify(b) })).json();
const sfx = Math.random().toString(36).slice(2, 7);
async function player(n, x) {
  const { token } = await post("register", { username: `t${n}_${sfx}`, password: "senha123" });
  const ch = { id: `c_${n}_${sfx}`, name: `Heroi${n}`, cls: "guerreiro", level: 3, gold: 50, inv: [], eq: {}, alloc: {}, quests: {} };
  const r = await post("account", { chars: [ch], stash: Array(40).fill(null) }, token, "PUT");
  if (!r.ok) throw new Error("PUT falhou: " + JSON.stringify(r));
  const back = await (await fetch(base + "/api/account", { headers: { Authorization: "Bearer " + token } })).json();
  if (back.chars.length !== 1) throw new Error("GET não devolveu o personagem");
  return new Client(base.replace(/^http/, "ws")).joinOrCreate("world", { token, charId: ch.id, x, z: 5 });
}
const a = await player(1, 0), b = await player(2, 3);
let corrected = false; a.onMessage("correct", () => (corrected = true));
await new Promise((r) => setTimeout(r, 400));
b.send("move", { x: 4, z: 5 });
a.send("move", { x: 70, z: 70 }); // teleporte: deve ser limitado
await new Promise((r) => setTimeout(r, 600));
const seen = [...a.state.players.values()].map((p) => `${p.name}@${p.x.toFixed(1)},${p.z.toFixed(1)}`);
console.log("A enxerga:", seen.join(" | "), "| teleporte corrigido:", corrected);
const ok = a.state.players.size === 2 && corrected;
a.leave(); b.leave();
console.log(ok ? "SMOKE OK" : "SMOKE FALHOU");
process.exit(ok ? 0 : 1);
