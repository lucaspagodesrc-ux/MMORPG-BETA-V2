// v3.0.0: caminhos no mundo único (A* na grade de 2 m do rules.js) — usado pelos bots para contornar rios, montanhas e muros.
const R: any = require("./rules.js");
const W = R.WORLD, NX: number = W.NX, NZ: number = W.NZ, CS: number = W.CS, G: Uint8Array = W.G;
const ok = (c: number, r: number) => c >= 0 && r >= 0 && c < NX && r < NZ && (G[r * NX + c] & 8) !== 0;
const cellOf = (x: number, z: number): [number, number] => [Math.floor((x - W.X0) / CS), Math.floor((W.Z1 - z) / CS)];
const posOf = (c: number, r: number) => ({ x: W.X0 + (c + 0.5) * CS, z: W.Z1 - (r + 0.5) * CS });
/** linha reta livre (passos de meia célula) */
export function clear(x0: number, z0: number, x1: number, z1: number): boolean {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / (CS * 0.5));
  for (let i = 1; i <= n; i++) { const t = i / n, [c, r] = cellOf(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t); if (!ok(c, r)) return false; }
  return true;
}
/** célula andável mais perto */
function nearest(c: number, r: number): [number, number] | null {
  if (ok(c, r)) return [c, r];
  for (let rad = 1; rad < 30; rad++) for (let dc = -rad; dc <= rad; dc++) for (const dr of [-rad, rad]) { if (ok(c + dc, r + dr)) return [c + dc, r + dr]; if (ok(c + dr, r + dc)) return [c + dr, r + dc]; }
  return null;
}
const gS = new Float32Array(NX * NZ), from = new Int32Array(NX * NZ), seen = new Uint32Array(NX * NZ), done = new Uint32Array(NX * NZ); let stamp = 0;
/** A* (8 direções) → lista de pontos (já sem os pontos desnecessários), ou null */
export function findPath(x0: number, z0: number, x1: number, z1: number, maxNodes = 90000): { x: number; z: number }[] | null {
  if (clear(x0, z0, x1, z1)) return [{ x: x1, z: z1 }];
  const a = nearest(...cellOf(x0, z0)), b = nearest(...cellOf(x1, z1)); if (!a || !b) return null;
  stamp++; const S = a[1] * NX + a[0], T = b[1] * NX + b[0];
  const heap: number[] = [], hf: number[] = [];
  const push = (i: number, f: number) => { heap.push(i); hf.push(f); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; } };
  const pop = () => { const top = heap[0], lh = heap.pop()!, lf = hf.pop()!; if (heap.length) { heap[0] = lh; hf[0] = lf; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; } } return top; };
  const h = (i: number) => { const c = i % NX, r = (i / NX) | 0; return Math.hypot(c - b[0], r - b[1]); };
  seen[S] = stamp; gS[S] = 0; from[S] = -1; push(S, h(S)); let n = 0, found = false;
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length && n++ < maxNodes) {
    const i = pop(); if (i === T) { found = true; break; }
    if (done[i] === stamp) continue; done[i] = stamp;   // já expandida (entrada velha da fila)
    const c = i % NX, r = (i / NX) | 0;
    for (const [dc, dr, k] of D) {
      const c2 = c + dc, r2 = r + dr; if (!ok(c2, r2)) continue; if (dc && dr && (!ok(c + dc, r) || !ok(c, r + dr))) continue;
      const j = r2 * NX + c2, g = gS[i] + k; if (done[j] === stamp || (seen[j] === stamp && g >= gS[j])) continue;
      seen[j] = stamp; gS[j] = g; from[j] = i; push(j, g + h(j) * 1.05);
    }
  }
  if (!found) return null;
  const cells: number[] = []; for (let i = T; i !== -1; i = from[i]) cells.push(i); cells.reverse();
  const pts = cells.map((i) => posOf(i % NX, (i / NX) | 0)); pts[pts.length - 1] = { x: x1, z: z1 };
  const out: { x: number; z: number }[] = []; let cur = { x: x0, z: z0 }, k = 0;   // corta caminho onde a linha reta é livre
  while (k < pts.length) { let far = k; for (let j = Math.min(pts.length - 1, k + 40); j > k; j--) if (clear(cur.x, cur.z, pts[j].x, pts[j].z)) { far = j; break; } out.push(pts[far]); cur = pts[far]; k = far + 1; }
  return out;
}
