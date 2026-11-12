// Funções de item compartilhadas por leilão, correio e troca.
const R: any = require("./rules.js");

const sortObj = (o: any): any => Array.isArray(o) ? o.map(sortObj) : o && typeof o === "object" ? Object.keys(o).sort().reduce((a: any, k) => { a[k] = sortObj(o[k]); return a; }, {}) : o;
export const ikeyOf = (it: any) => it.k === "eq" ? JSON.stringify(sortObj(it)) : it.k + ":" + it.id;
export const proto = (it: any) => it.k === "eq" ? JSON.parse(JSON.stringify(it)) : { k: it.k, id: it.id };
export const tradeable = (it: any) => !!it && !it.bd && (it.k === "eq" || it.k === "mat" || it.k === "pot");   // itens de evento (bd) são vinculados ao personagem
export const invKey = (it: any) => tradeable(it) ? ikeyOf(it) : "";
export const itemOut = (p: any, n = 1) => p.k === "eq" ? p : { k: p.k, id: p.id, n };
/** divide em itens colocáveis na mochila (pilhas de até 99) */
export const chunks = (p: any, qty: number) => {
  if (p.k === "eq") return Array.from({ length: qty }, () => proto(p));
  const o: any[] = []; let n = qty; while (n > 0) { const a = Math.min(99, n); o.push({ k: p.k, id: p.id, n: a }); n -= a; } return o;
};
/** cabem `qty` unidades de `p` na mochila `inv`? */
export function fits(inv: any[], p: any, qty: number) {
  const c = JSON.parse(JSON.stringify(inv));
  for (const it of chunks(p, qty)) if (!R.addItem(c, it)) return false;
  return true;
}
export const invCount = (c: any, key: string) => c.inv.reduce((a: number, s: any) => a + (s && invKey(s) === key ? (s.k === "eq" ? 1 : s.n) : 0), 0);
export function invTake(c: any, key: string, q: number) {
  for (let i = 0; i < c.inv.length && q > 0; i++) {
    const s = c.inv[i]; if (!s || invKey(s) !== key) continue;
    if (s.k === "eq") { c.inv[i] = null; q--; } else { const a = Math.min(s.n, q); s.n -= a; q -= a; if (s.n <= 0) c.inv[i] = null; }
  }
}
