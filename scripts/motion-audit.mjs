// Audit géométrique des 63 mouvements de Mìmir : emprise (bbox) du personnage animé versus le viewBox
// de base "250 190 752 700". Usage : node scripts/motion-audit.mjs   (Node >= 22.18)
import * as M from '../src/motion.ts';

const L = 'M304 300Q304 291 312 296.5L559 466.3Q567 472 565.5 482L550 584L522 563L402 478L402 758L304 690Z';
const A = 'M625 452L676 556L676 762L625 846L574 762L574 556Z';
const S = 'M625 252Q645 308 696 328Q645 348 625 404Q605 348 554 328Q605 308 625 252Z';
function pts(d) {
  const t = d.match(/[MLQZ]|-?[\d.]+/g); let i = 0, cx = 0, cy = 0; const out = [];
  while (i < t.length) { const c = t[i++];
    if (c === 'M' || c === 'L') { cx = +t[i++]; cy = +t[i++]; out.push([cx, cy]); }
    else if (c === 'Q') { const x1 = +t[i++], y1 = +t[i++], x = +t[i++], y = +t[i++]; for (let k = 1; k <= 12; k++) { const u = k / 12; out.push([(1 - u) ** 2 * cx + 2 * (1 - u) * u * x1 + u * u * x, (1 - u) ** 2 * cy + 2 * (1 - u) * u * y1 + u * u * y]); } cx = x; cy = y; } }
  return out;
}
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const mirror = ([x, y]) => [1252 - x, y];
const PL = pts(L), PA = pts(A), PS = pts(S);
const headScale = M.mul(M.mul([1, 0, 0, 1, 625, 318], [1.4, 0, 0, 1.4, 0, 0]), [1, 0, 0, 1, -625, -328]);
const EYES = [[602, 314], [648, 338], [602, 338], [648, 314]];

const layer = (spec, key, piv) => {
  const p = M.parseSpec(spec);
  return (t) => p ? M.primMatrix(M.PRIMS[p.prim], t, piv ?? M.PIV[key]).m : M.I;
};
function frame(mv, t, oldMid) {
  const figKey = mv.fo === 'mid' ? 'figMid' : 'fig';
  const fig = layer(mv.f, figKey, oldMid && mv.fo === 'mid' ? { x: 625, y: 674 } : undefined)(t);
  const out = [];
  const add = (m, ps) => ps.forEach(p => out.push(apply(M.mul(fig, m), p)));
  add(layer(mv.l, 'armL')(t), PL);
  add(layer(mv.r, 'armR')(t), PL.map(mirror));
  add(layer(mv.b, 'fig')(t), PA);
  const head = mv.h && !mv.h.startsWith('hFlash') ? layer(mv.h, 'head')(t) : M.I;
  add(M.mul(head, M.mul(headScale, layer(mv.s, 'star')(t))), PS);
  add(M.mul(head, headScale), EYES);
  if (mv.fx === 'dizzy') add(M.I, [[625 - 123, 205 - 40], [625 + 123, 205 + 40], [625 - 123, 205 + 40], [625 + 123, 205 - 40]]);
  if (mv.fx === 'sneeze') add(M.I, [[735, 215], [1010, 270], [865, 345], [735, 300]]);
  return out;
}
function extent(mv, oldMid) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let t = 0; t <= 1.0001; t += 0.01) for (const [x, y] of frame(mv, t, oldMid)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, x1, y0, y1 };
}
const VB = M.VB;
const over = e => ({ l: Math.max(0, VB.x - e.x0), r: Math.max(0, e.x1 - (VB.x + VB.w)), t: Math.max(0, VB.y - e.y0), b: Math.max(0, e.y1 - (VB.y + VB.h)) });
const R = M.ROOM;
let worst = { l: 0, r: 0, t: 0, b: 0 }, cut = 0, bad = 0;
const rows = [];
M.MOVES.forEach(mv => {
  const o = over(extent(mv));
  const isCut = o.l + o.r + o.t + o.b > 0.5;
  if (isCut) cut++;
  for (const k of 'lrtb') worst[k] = Math.max(worst[k], o[k]);
  const tooBig = o.l > R.l || o.r > R.r || (o.t > R.t && mv.n !== 'Atterrissage') || o.b > R.b;
  if (tooBig) bad++;
  if (isCut) rows.push(`${mv.n.padEnd(16)} dépasse : gauche ${o.l.toFixed(0)} droite ${o.r.toFixed(0)} haut ${o.t.toFixed(0)} bas ${o.b.toFixed(0)}${tooBig ? '  <-- HORS MARGE' : ''}`);
});
console.log(`${M.MOVES.length} mouvements ; ${cut} dépassent le viewBox de base 250 190 752 700 (coupés si Svg sans marge) :`);
console.log(rows.join('\n'));
console.log('pire dépassement par côté :', worst, ' marge ROOM :', R);
console.log(bad ? `ECHEC : ${bad} mouvement(s) hors marge` : 'OK : tous les mouvements tiennent dans viewBox + ROOM (hors Atterrissage qui tombe depuis le haut de l’écran)');
// preuve du pivot figMid : emprise de la pirouette, ancien (625,674) vs nouveau (626,560.5)
for (const n of ['Pirouette', 'Salto', 'Tourbillon']) {
  const mv = M.MOVES.find(m => m.n === n);
  const a = over(extent(mv, true)), b = over(extent(mv, false));
  console.log(`${n}: ancien pivot y=674 -> dépassement`, JSON.stringify(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, Math.round(v)]))), '| pivot réel 560.5 ->', JSON.stringify(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v)]))));
}
process.exit(bad ? 1 : 0);
