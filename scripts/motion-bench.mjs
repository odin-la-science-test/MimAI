// Micro-benchmark : coût CPU (thread JS) par image d'un personnage Mìmir, ANCIEN pipeline vs NOUVEAU.
//  ancien  : par canal animé → interpolation Animated → chaîne `translate() rotate() translate()` → extractTransform (parseur PEG réel de react-native-svg)
//  nouveau : par spec → matrice [a b c d e f] directe (motion.ts compileMotion().at)
// Le coût Animated (graphe de noeuds, rafraîchissement des props) de l'ancien moteur N'EST PAS compté : l'écart réel est donc plus grand.
// Usage : npm run bench:motion   (Node >= 22.18 / 24)
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { MOVES, PRIMS, PIV, FX_SPECS, parseSpec, expandKeys, compileMotion } from '../src/motion.ts';

const extractTransform = createRequire(import.meta.url)('react-native-svg/lib/commonjs/lib/extract/extractTransform.js').default;

const interp = (inR, outR, x) => {
  let i = 1;
  for (; i < inR.length - 1; i++) if (inR[i] >= x) break;
  const r = i - 1, a = inR[r], b = inR[r + 1];
  return a === b ? (x <= a ? outR[r] : outR[r + 1]) : outR[r] + (outR[r + 1] - outR[r]) * ((x - a) / (b - a));
};
const expCache = new Map();
const num = (prim, vals, t) => {
  let e = expCache.get(vals); if (!e) { e = expandKeys(prim.keys, vals, prim.linear); expCache.set(vals, e); }
  return interp(e.keys, e.vals, t);
};

/* ancien : une chaîne par <G> animé, parsée à chaque image */
function oldFrame(spec, pivot, t) {
  const prim = PRIMS[spec.prim]; const { x, y } = pivot; let n = 0;
  for (const c of prim.ch) {
    if (c[0] === 'op') { num(prim, c[1], t); continue; }
    if (c[0] === 'ty') extractTransform(`translate(0 ${num(prim, c[1], t)})`);
    else if (c[0] === 'tx') extractTransform(`translate(${num(prim, c[1], t)} 0)`);
    else if (c[0] === 'scl') extractTransform(`translate(${x} ${y}) scale(${num(prim, c[1], t)}) translate(${-x} ${-y})`);
    else if (c[0] === 'rot') extractTransform(`translate(${x} ${y}) rotate(${num(prim, c[1], t)}) translate(${-x} ${-y})`);
    else { extractTransform(`translate(${x} ${y}) scale(${num(prim, c[1], t)} 1) translate(${-x} ${-y})`); extractTransform(`translate(${x} ${y}) scale(1 ${num(prim, c[2], t)}) translate(${-x} ${-y})`); }
    n++;
  }
  return n;
}

/* spécs (prim, pivot) d'un mouvement, comme BuddyMove */
function layersOf(mv) {
  const out = [];
  const add = (s, pv) => { const p = parseSpec(s); if (p) out.push({ p, pv }); };
  add(mv.f, PIV[mv.fo === 'mid' ? 'figMid' : 'fig']); add(mv.l, PIV.armL); add(mv.r, PIV.armR); add(mv.b, PIV.fig);
  add(mv.h, PIV.head); add(mv.s, PIV.star); add(mv.e || (mv.eyes === 'open' || !mv.eyes ? 'bBlink 4' : undefined), PIV.eyes);
  if (mv.fx) FX_SPECS[mv.fx](mv.rep ?? 1).forEach(s => add(s, PIV.fig));
  return out;
}

const T = Array.from({ length: 64 }, (_, i) => (i + .37) / 64);
function bench(label, run, reps) {
  for (let i = 0; i < 3; i++) run(); // chauffe JIT
  const t0 = performance.now();
  for (let r = 0; r < reps; r++) run();
  return (performance.now() - t0) / reps;
}

const rows = [];
for (const mv of MOVES) {
  const L = layersOf(mv);
  const comps = L.map(l => compileMotion(l.p, l.pv));
  let groupsOld = 0;
  const oldMs = bench('old', () => { for (const t of T) for (const l of L) groupsOld += oldFrame(l.p, l.pv, t); }, 12) / T.length;
  const newMs = bench('new', () => { for (const t of T) for (const c of comps) c.at(t); }, 400) / T.length;
  rows.push({ n: mv.n, specs: L.length, gOld: L.reduce((s, l) => s + PRIMS[l.p.prim].ch.reduce((k, c) => k + (c[0] === 'op' ? 0 : c[0] === 'sxy' ? 2 : 1), 0), 0), oldMs, newMs });
}
const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
const f = (x) => x.toFixed(4);
const pick = (n) => rows.find(r => r.n === n);
console.log('Coût par IMAGE et par personnage (ms de thread JS, hors coût Animated de l\'ancien moteur) :');
for (const n of ['Repos', 'Danse', 'Étourdi', 'Tremblement']) {
  const r = pick(n);
  console.log(`  ${n.padEnd(12)} ancien ${f(r.oldMs)} ms (${r.gOld} parsages PEG)  nouveau ${f(r.newMs)} ms  → x${(r.oldMs / r.newMs).toFixed(0)}`);
}
const worst = rows.reduce((a, b) => (b.oldMs > a.oldMs ? b : a));
console.log(`  pire ancien (${worst.n}) : ${f(worst.oldMs)} ms  → nouveau ${f(worst.newMs)} ms`);
console.log(`  moyenne 63 mouvements : ancien ${f(avg('oldMs'))} ms, nouveau ${f(avg('newMs'))} ms  → x${(avg('oldMs') / avg('newMs')).toFixed(0)}`);
const galOld = rows.reduce((s, r) => s + r.oldMs, 0), galNew = rows.reduce((s, r) => s + r.newMs, 0);
console.log(`Galerie (63 vignettes animées ensemble) par image : ancien ${f(galOld)} ms  (60 i/s → ${(galOld * 60 / 10).toFixed(0)} % du thread JS ; budget 16,7 ms/image)`);
console.log(`                                   nouveau ${f(galNew)} ms  (galerie désormais statique : 1 à 2 personnages animés → ~${f(avg('newMs') * 2)} ms)`);
console.log(`Groupes <G> animés par personnage (moyenne) : ancien ${(avg('gOld')).toFixed(1)} (imbriqués), nouveau ${(rows.reduce((s, r) => s + r.specs, 0) / rows.length).toFixed(1)} (un par spec)`);
