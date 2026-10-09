// Équivalence visuelle du moteur d'animation : ANCIEN calcul (Animated.interpolate → chaîne `translate() rotate() translate()` →
// extractTransform RÉEL de react-native-svg, parseur PEG inclus) versus NOUVEAU calcul (matrice numérique directe, motion.ts).
// Couvre les 63 mouvements (canaux f/l/r/b/h/s/e + effets), les yeux étourdis, le logo Mark, à 21 instants t∈[0,1] + toutes les clés.
// Exécution : npm run test:motion   (Node >= 22.18 / 24)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  MOVES, PRIMS, PIV, FX_SPECS, parseSpec, expandKeys, compileMotion, phaseAt, stillTime, createTicker, mul, I,
} from '../src/motion.ts';

const require = createRequire(import.meta.url);
const extractTransform = require('react-native-svg/lib/commonjs/lib/extract/extractTransform.js').default;

/* ── ANCIEN moteur (copie fidèle de l'ancien AnimG de src/art.tsx) ── */
/* Animated.interpolate (RN) : segment par recherche linéaire, extrapolation « extend » */
const interp = (inR, outR, x) => {
  let i = 1;
  for (; i < inR.length - 1; i++) if (inR[i] >= x) break;
  const r = i - 1, a = inR[r], b = inR[r + 1];
  if (a === b) return x <= a ? outR[r] : outR[r + 1];
  return outR[r] + (outR[r + 1] - outR[r]) * ((x - a) / (b - a));
};
const num = (prim, vals, t) => { const e = expandKeys(prim.keys, vals, prim.linear); return interp(e.keys, e.vals, t); };
const M = (s) => extractTransform(s);
function oldFrame(spec, pivot, t) {
  const parsed = parseSpec(spec);
  const prim = PRIMS[parsed.prim];
  const { x, y } = pivot;
  let m = I, op = null;
  for (const c of prim.ch) {
    let l = I;
    if (c[0] === 'op') op = (op ?? 1) * num(prim, c[1], t);
    else if (c[0] === 'ty') l = M(`translate(0 ${interp([-600, 600], [-600, 600], num(prim, c[1], t))})`);
    else if (c[0] === 'tx') l = M(`translate(${interp([-600, 600], [-600, 600], num(prim, c[1], t))} 0)`);
    else if (c[0] === 'scl') { const k = num(prim, c[1], t); l = M(`translate(${x} ${y}) scale(${k}) translate(${-x} ${-y})`); }
    else if (c[0] === 'rot') { const k = num(prim, c[1], t); l = M(`translate(${x} ${y}) rotate(${k}) translate(${-x} ${-y})`); }
    else if (c[0] === 'sxy') {
      const kx = num(prim, c[1], t), ky = num(prim, c[2], t);
      l = mul(M(`translate(${x} ${y}) scale(${kx} 1) translate(${-x} ${-y})`), M(`translate(${x} ${y}) scale(1 ${ky}) translate(${-x} ${-y})`));
    }
    m = mul(m, l);
  }
  return { m, op };
}

/* ── jeu complet de (spec, pivot) comme dans BuddyMove / Eyes / Fx / Mark ── */
const cases = [];
const add = (label, spec, pivot) => { if (spec && parseSpec(spec)) cases.push({ label, spec, pivot }); };
for (const mv of MOVES) {
  const eyeSpec = mv.e || (mv.eyes === 'open' || !mv.eyes ? 'bBlink 4' : undefined);
  const flash = parseSpec(mv.h)?.prim === 'hFlash';
  add(mv.n + ' f', mv.f, PIV[mv.fo === 'mid' ? 'figMid' : 'fig']);
  add(mv.n + ' l', mv.l, PIV.armL);
  add(mv.n + ' r', mv.r, PIV.armR);
  add(mv.n + ' b', mv.b, PIV.fig);
  add(mv.n + ' h', flash ? undefined : mv.h, PIV.head);
  add(mv.n + ' flash', flash ? mv.h : undefined, PIV.fig);
  add(mv.n + ' s', mv.s, PIV.star);
  add(mv.n + ' eyes', eyeSpec, PIV.eyes);
  if (mv.eyes === 'dizzy') for (const cx of [611, 639]) add(mv.n + ' spiral' + cx, 'eSpin .6 0 6', { x: cx, y: 326 });
  if (mv.fx) FX_SPECS[mv.fx](mv.rep ?? 1).forEach((s, i) => add(mv.n + ' fx' + i, s, PIV.fig));
}
for (const s of ['mmPulseL 1.5', 'mmPulseR 1.5 .4', 'mmPulseA 1.5 .2']) add('Mark ' + s, s, PIV.fig);
add('Mark star', 'sFast 1.5', PIV.star);

const TS = Array.from({ length: 21 }, (_, i) => i / 20);
const close = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-6, `${msg} : ${a} ≠ ${b}`);

test('couverture : 63 mouvements et tous leurs canaux', () => {
  assert.equal(MOVES.length, 63);
  assert.ok(cases.length > 120, 'cas=' + cases.length);
});

test('matrices + opacités identiques (ancien parseur PEG vs matrice directe), tol 1e-6', () => {
  let checks = 0;
  for (const { label, spec, pivot } of cases) {
    const comp = compileMotion(parseSpec(spec), pivot);
    const prim = PRIMS[parseSpec(spec).prim];
    const keyTs = new Set(TS);
    for (const k of prim.keys) keyTs.add(k);
    for (const t of keyTs) {
      const o = oldFrame(spec, pivot, t), n = comp.at(t);
      for (let i = 0; i < 6; i++) close(o.m[i], n.m ? n.m[i] : I[i], `${label} t=${t} m[${i}]`);
      if (o.op === null) assert.equal(n.op, null, `${label} op présent à tort`);
      else close(o.op, n.op, `${label} t=${t} opacité`);
      checks++;
    }
  }
  assert.ok(checks > 3000, 'vérifications=' + checks);
  console.log(`  ${cases.length} (spec,pivot) × instants = ${checks} comparaisons, écart max < 1e-6`);
});

test('un seul <G> par spec : opacité portée par le même groupe, aucune matrice sans canal de transformation', () => {
  for (const { spec, pivot } of cases) {
    const c = compileMotion(parseSpec(spec), pivot);
    const prim = PRIMS[parseSpec(spec).prim];
    assert.equal(c.hasM, prim.ch.some(x => x[0] !== 'op'));
    assert.equal(c.hasOp, prim.ch.some(x => x[0] === 'op'));
    assert.equal(c.at(.3).m === null, !c.hasM);
  }
});

test('phaseAt = boucle Animated (délai unique, cycles, lecture unique)', () => {
  assert.deepEqual(phaseAt(500, 1000, false, 1, 100), { t: 0, done: false });
  assert.equal(phaseAt(500, 1000, false, 1, 500 + 1250).t, .25);
  assert.equal(phaseAt(500, 1000, false, 1, 500 + 3250).t, .25);
  assert.deepEqual(phaseAt(0, 1000, true, 2, 1999), { t: .999, done: false });
  assert.deepEqual(phaseAt(0, 1000, true, 2, 2000), { t: 1, done: true });
  assert.deepEqual(phaseAt(250, 100, true, 20, 250 + 2000), { t: 1, done: true });
  assert.equal(phaseAt(0, 1000, false, 1, 1e7).done, false); // boucle infinie
});

test('images fixes des vignettes : figure visible, droite, pas écrasée', () => {
  for (const mv of MOVES) {
    const t = stillTime(mv);
    assert.ok([0, .2, .35, .5].includes(t), mv.n);
    const fp = parseSpec(mv.f);
    if (!fp) continue;
    const fr = compileMotion(fp, PIV[mv.fo === 'mid' ? 'figMid' : 'fig']).at(t);
    if (fr.op !== null) assert.ok(fr.op >= .9 || t === 0, mv.n);
    if (fr.m) assert.ok(Math.abs(Math.atan2(fr.m[1], fr.m[0])) <= Math.PI / 3 + 1e-9, mv.n + ' retourné');
  }
});

/* ── horloge partagée ── */
function fakeRaf() {
  let q = [], id = 0, now = 0;
  return {
    env: { raf: cb => { q.push([++id, cb]); return id; }, caf: h => { q = q.filter(x => x[0] !== h); } },
    step(ms = 1000 / 60) { now += ms; const cur = q; q = []; cur.forEach(([, cb]) => cb(now)); },
    pending: () => q.length,
  };
}

test('ticker : une seule boucle rAF, cadence limitée, arrêt à done, plus de rAF sans abonné', () => {
  const f = fakeRaf(); let busy = 0, idle = 0;
  const tk = createTicker(f.env, { onBusy: () => busy++, onIdle: () => idle++ });
  let a = 0, b = 0, c = 0;
  const offA = tk.add(0, () => { a++; });
  const offB = tk.add(33, () => { b++; });
  tk.add(0, () => { c++; return c >= 5; });
  assert.equal(f.pending(), 1, 'une seule boucle rAF pour tous');
  for (let i = 0; i < 61; i++) f.step();
  assert.equal(c, 5, 'abonné terminé retiré');
  assert.ok(a >= 59 && a <= 61, 'a=' + a);
  assert.ok(b >= 29 && b <= 31, '30 images/s : b=' + b);
  assert.equal(tk.size(), 2);
  offA(); offB();
  assert.equal(tk.size(), 0);
  assert.equal(f.pending(), 0, 'aucun rAF pendant sans abonné (pas de fuite)');
  assert.equal(busy, 1);
  assert.ok(idle >= 1);
});

test('ticker : pause (arrière-plan) arrête rAF, reprise sans saut de temps', () => {
  const f = fakeRaf();
  const tk = createTicker(f.env);
  const dts = [];
  tk.add(0, dt => { dts.push(dt); });
  f.step(); f.step(); f.step();
  tk.setPaused(true);
  assert.equal(f.pending(), 0);
  tk.setPaused(false);
  assert.equal(f.pending(), 1);
  f.step(60000); f.step(); // 1 min plus tard : la 1re image après reprise ne compte pas ; dt borné ensuite
  assert.ok(dts.every(d => d <= 100), JSON.stringify(dts));
});
