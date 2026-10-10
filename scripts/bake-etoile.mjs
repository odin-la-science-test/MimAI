#!/usr/bin/env node
// « Cuit » les 156 animations de l'étoile de Mìmir (moteur de la maquette assets/design/etoile-engine.js) en données
// lisibles par le module Android : modules/mimir-overlay/android/src/main/assets/etoile.json.
//
//   npm run etoile:bake
//
// Le moteur d'origine (JavaScript + SVG) est exécuté tel quel dans Node ; pour chaque animation on échantillonne, à 30 images
// par seconde, exactement ce qu'il calcule (position, rotation, échelle, couleur, yeux, effets). Le téléphone n'a plus qu'à
// rejouer ces images avec un dessin simple (Canvas) : mêmes animations, sans WebView ni moteur JavaScript dans la barre.
// Les formes (étoile, yeux, effets) sont converties en chemins absolus (M, L, Q, C, Z) : aucun analyseur SVG côté Android.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'assets/design/etoile-engine.js');
const OUT_DIR = resolve(ROOT, 'modules/mimir-overlay/android/src/main/assets');
const FPS = 30;
const SCALE = 100;          // les effets sont échantillonnés pour une étoile de 100 unités ; lus à l'échelle réelle côté Android

/* ---- chargement du moteur dans Node (faux DOM minimal) ---- */
let code = readFileSync(SRC, 'utf8');
if (!code.includes('window.ETOILE = {')) throw new Error('ancre du moteur introuvable');
code = code.replace('window.ETOILE = {', 'window.__EI = { LIST, FAMS, TAP, AMB, evalClip, fxItems, mix, pal, RGB, EY, SH, STAR, HEX }; window.ETOILE = {');
const win = { addEventListener() {}, matchMedia: () => ({ matches: false }), console };
const doc = { documentElement: {}, createElementNS: () => ({ setAttribute() {}, appendChild() {} }) };
new Function('window', 'document', 'getComputedStyle', 'requestAnimationFrame', 'performance', code)(win, doc, () => ({ getPropertyValue: () => '' }), () => 0, { now: () => 0 });
const I = win.__EI;

/* ---- chemins SVG -> opérations absolues : 0=M x y, 1=L x y, 2=Q cx cy x y, 3=C c1x c1y c2x c2y x y, 4=Z ---- */
function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (phiDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den)); if (fa === fs) co = -co;
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9)), d = dth / n, t = (4 / 3) * Math.tan(d / 4);
  const out = [];
  let a1 = th1;
  for (let i = 0; i < n; i++) {
    const a2 = a1 + d, c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
    const p = (px, py) => [cp * rx * px - sp * ry * py + cx, sp * rx * px + cp * ry * py + cy];
    const e1 = p(c1 - t * s1, s1 + t * c1), e2 = p(c2 + t * s2, s2 - t * c2), e3 = p(c2, s2);
    out.push([e1[0], e1[1], e2[0], e2[1], e3[0], e3[1]]);
    a1 = a2;
  }
  return out;
}
function parsePath(d, tx = 0, ty = 0) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const ops = []; let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0;
  const num = () => parseFloat(toks[i++]);
  const P = (x, y) => [+(x + tx).toFixed(3), +(y + ty).toFixed(3)];
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    if (C === 'Z') { ops.push(4); cx = sx; cy = sy; continue; }
    if (C === 'M') { let x = num(), y = num(); if (rel) { x += cx; y += cy; } cx = sx = x; cy = sy = y; ops.push(0, ...P(x, y)); cmd = rel ? 'l' : 'L'; continue; }
    if (C === 'L') { let x = num(), y = num(); if (rel) { x += cx; y += cy; } cx = x; cy = y; ops.push(1, ...P(x, y)); continue; }
    if (C === 'H') { let x = num(); if (rel) x += cx; cx = x; ops.push(1, ...P(cx, cy)); continue; }
    if (C === 'V') { let y = num(); if (rel) y += cy; cy = y; ops.push(1, ...P(cx, cy)); continue; }
    if (C === 'Q') { let a = num(), b = num(), x = num(), y = num(); if (rel) { a += cx; b += cy; x += cx; y += cy; } ops.push(2, ...P(a, b), ...P(x, y)); cx = x; cy = y; continue; }
    if (C === 'C') { let a = num(), b = num(), c = num(), e = num(), x = num(), y = num(); if (rel) { a += cx; b += cy; c += cx; e += cy; x += cx; y += cy; } ops.push(3, ...P(a, b), ...P(c, e), ...P(x, y)); cx = x; cy = y; continue; }
    if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), fa = num(), fs = num(); let x = num(), y = num(); if (rel) { x += cx; y += cy; }
      arcToCubics(cx, cy, rx, ry, rot, fa, fs, x, y).forEach(c => ops.push(3, ...P(c[0], c[1]), ...P(c[2], c[3]), ...P(c[4], c[5])));
      cx = x; cy = y; continue;
    }
    throw new Error('commande de chemin non gérée : ' + cmd + ' dans ' + d);
  }
  return ops;
}

/* ---- couleurs : indices dans une palette hexadécimale ---- */
const colorKeys = Object.keys(I.HEX);
const colorIdx = k => { const j = colorKeys.indexOf(k); if (j < 0) throw new Error('couleur inconnue ' + k); return j; };

/* ---- formes ---- */
const shapeNames = Object.keys(I.SH);
const shapes = shapeNames.map(n => parsePath(I.SH[n]));
const body = parsePath(I.STAR, -625, -328);
const eyeNames = Object.keys(I.EY);
const eyes = {};
eyeNames.forEach(n => {
  eyes[n] = I.EY[n].map(d => d.t === 'circle'
    ? { t: 'c', cx: d.a.cx, cy: d.a.cy, r: d.a.r, w: d.w ? 1 : 0, g: d.g ? 1 : 0 }
    : { t: 'p', ops: parsePath(d.a.d), s: d.s || 0, g: d.g ? 1 : 0, w: d.w ? 1 : 0 });
});

/* ---- animations ---- */
const Q = I.pal();
const base = Q.a;
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const texts = [];
const textId = t => { let j = texts.indexOf(t); if (j < 0) { texts.push(t); j = texts.length - 1; } return j; };
let totalFrames = 0;
const anims = I.LIST.map(A => {
  const N = Math.max(2, Math.ceil(A.d * FPS));
  const f = [], g = [], fx = [];
  let anyGrad = false;
  for (let i = 0; i < N; i++) {
    const p = i / N;
    const c = I.evalClip(A, p, base, Q);
    f.push(r3(c.x), r3(c.y), r2(c.r), r3(c.s), r3(c.sx), r3(c.sy), r3(c.fy), r3(c.op), r3(c.glow), r3(c.ex), r3(c.ey), r3(c.col[0]), r3(c.col[1]), r3(c.col[2]), eyeNames.indexOf(c.eyes));
    if (c.grad) { anyGrad = true; g.push([r3(c.grad[0][0]), r3(c.grad[0][1]), r3(c.grad[0][2]), r3(c.grad[1][0]), r3(c.grad[1][1]), r3(c.grad[1][2]), r2(c.grad[2] % 360)]); } else g.push(0);
    const out = { f: [], b: [], r: [], x: [] };
    A.x.forEach(e => { if (e.k !== 'tr') I.fxItems(e, p, SCALE, 0, 0, out); });
    const items = [];
    out.f.forEach(it => items.push([0, shapeNames.indexOf(it.sh), r2(it.x), r2(it.y), r2(it.z), r2(it.r || 0), r2(it.op), colorIdx(it.c)]));
    out.b.forEach(it => items.push([1, shapeNames.indexOf(it.sh), r2(it.x), r2(it.y), r2(it.z), r2(it.r || 0), r2(it.op), colorIdx(it.c)]));
    out.r.forEach(it => items.push([2, 0, r2(it.x), r2(it.y), r2(it.rad), r2(it.w), r2(it.op), colorIdx(it.c), it.dash == null ? -1 : r3(it.dash)]));
    out.x.forEach(it => items.push([3, textId(it.t), r2(it.x), r2(it.y), r2(it.size), 0, r2(it.op), colorIdx(it.c)]));
    fx.push(items);
  }
  totalFrames += N;
  return { id: A.id, n: A.n, fam: A.fam, d: A.d, trail: A.trail || 0, colored: !!A.c, frames: N, f, ...(anyGrad ? { g } : {}), fx: fx.some(a => a.length) ? fx : undefined };
});

const data = {
  fps: FPS, scale: SCALE,
  colors: colorKeys.map(k => I.HEX[k]), colorKeys,
  shapeNames, shapes, body,
  eyeNames, eyes, texts,
  tap: I.TAP, amb: I.AMB,
  fams: I.FAMS.map(f => ({ id: f.id, n: f.n, d: f.d })),
  anims,
};
mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify(data);
writeFileSync(resolve(OUT_DIR, 'etoile.json'), json);
console.log('animations :', anims.length, '· images :', totalFrames, '· taille :', (json.length / 1024).toFixed(0), 'Ko ->', 'modules/mimir-overlay/android/src/main/assets/etoile.json');
