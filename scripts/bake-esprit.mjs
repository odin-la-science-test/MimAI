#!/usr/bin/env node
// « Cuit » les 156 animations de L'ESPRIT GARDIEN (le personnage du mode en ligne ; moteur de la maquette
// assets/design/esprit-engine.js) en données lisibles par le module Android : modules/mimir-overlay/android/src/main/assets/esprit.json.
//
//   npm run esprit:bake
//
// Même principe que bake-etoile.mjs : le moteur d'origine (JavaScript + SVG) est exécuté tel quel dans Node ; pour chaque animation on
// échantillonne à 30 images par seconde les valeurs qu'il calcule (position, ailes, capuche, runes, yeux, couleur…) et les effets
// (plumes, runes, portail…). Le téléphone n'a plus qu'à rejouer ces images avec un dessin Canvas.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePath } from './_svgpath.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'assets/design/esprit-engine.js');
const OUT_DIR = resolve(ROOT, 'modules/mimir-overlay/android/src/main/assets');
const FPS = 30;
const SCALE = 100;            // les effets sont échantillonnés pour un personnage de 100 unités de haut ; lus à l'échelle réelle côté Android

/* ---- chargement du moteur dans Node (faux DOM minimal) ---- */
let code = readFileSync(SRC, 'utf8');
if (!code.includes('window.ESPRIT = {')) throw new Error('ancre du moteur introuvable');
code = code.replace('window.ESPRIT = {', 'window.__EI = { LIST, BY, FAMS, TAP, AMB, evalClip, fxp, L, HEX, SH, SHAPES, RUNES, FEATH, RIM, VOID, BROW, hoodD, ADD, MUL }; window.ESPRIT = {');
const win = { addEventListener() {}, matchMedia: () => ({ matches: false }), console, ETOILE: null };
const doc = { documentElement: {}, createElementNS: () => ({ setAttribute() {}, appendChild() {} }) };
new Function('window', 'document', 'getComputedStyle', 'requestAnimationFrame', 'performance', 'IntersectionObserver', code)(win, doc, () => ({ getPropertyValue: () => '' }), () => 0, { now: () => 0 }, undefined);
const I = win.__EI;

const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;

/* ---- ordre des champs d'une image (identique côté Kotlin : EspritData.F_*) ---- */
const ADD = I.ADD, MUL = I.MUL;
const FIELDS = [...ADD, ...MUL, 'hold'];
// + col0 col1 col2 + eyes
const STRIDE = FIELDS.length + 4;

/* ---- couleurs ---- */
const hexKeys = Object.keys(I.HEX);
const colorIdx = k => { const j = hexKeys.indexOf(k); if (j < 0) throw new Error('couleur inconnue ' + k); return j; };

/* ---- formes ---- */
const shapeNames = Object.keys(I.SH);
const shapes = shapeNames.map(n => parsePath(I.SH[n]));
const eyeNames = Object.keys(I.SHAPES);
const eyes = {};
eyeNames.forEach(n => {
  eyes[n] = I.SHAPES[n].map(d => {
    const o = { t: d.t, k: d.k, w: d.w || 0, m: d.m ? 1 : 0 };
    if (d.t === 'path') o.ops = parsePath(d.a.d); else o.a = d.a;
    return o;
  });
});

/* ---- animations ---- */
const base = I.L.c5;
const texts = [];
const textId = t => { let j = texts.indexOf(t); if (j < 0) { texts.push(t); j = texts.length - 1; } return j; };
const ALL = [...I.LIST, ...Object.values(I.BY).filter(a => a.fam === 'extra')];
let totalFrames = 0;
const eyeIdx = n => { const j = eyeNames.indexOf(n); return j < 0 ? 0 : j; };
// « wide », « small », « clin » ne sont pas des formes : le moteur les traduit (expr) ; on garde le nom d'origine pour que Kotlin refasse la même traduction
const EXTRA_EYE = ['wide', 'small', 'clin'];
const eyeKeys = [...eyeNames, ...EXTRA_EYE];
const eyeKeyIdx = n => { const j = eyeKeys.indexOf(n); return j < 0 ? 0 : j; };

const anims = ALL.map(A => {
  const N = Math.max(2, Math.ceil(A.d * FPS));
  const f = [], fx = [];
  for (let i = 0; i < N; i++) {
    const p = i / N;
    const c = I.evalClip(A, p, base);
    FIELDS.forEach(q => f.push(r3(c[q] || 0)));
    f.push(r3(c.col[0]), r3(c.col[1]), r3(c.col[2]), eyeKeyIdx(c.eyes));
    const out = { f: [], b: [], o: [], x: [], g: [] };
    if (A.x.length) {
      const S = SCALE, kS = S / 114, rr = (c.r || 0) * Math.PI / 180, th = 57 + (c.hh || 0);
      const SX = c.s * c.sx * kS, SY = c.s * c.sy * kS;
      const X = (c.x || 0) * S, Y = (c.y || 0) * S;
      const TX = X + Math.sin(rr) * th * SY + (c.ht || 0) * SX * Math.cos(rr), TY = Y - Math.cos(rr) * th * SY;
      A.x.forEach(q => { if (q.k !== 'trainee') I.fxp(q, p, S, X, Y, 0, 0, TX, TY, out); });
    }
    // lignes : [couche, a, x, y, b, c, d, opacité, couleur, e, f]  (couche 0 devant, 1 derrière, 2 anneau, 3 texte, 4 fantôme)
    const items = [];
    out.f.forEach(it => items.push([0, shapeNames.indexOf(it.sh), r2(it.x), r2(it.y), r2(it.z), r2(it.r || 0), 0, r2(it.op), colorIdx(it.c), 0, 0]));
    out.b.forEach(it => items.push([1, shapeNames.indexOf(it.sh), r2(it.x), r2(it.y), r2(it.z), r2(it.r || 0), 0, r2(it.op), colorIdx(it.c), 0, 0]));
    out.o.forEach(it => items.push([2, 0, r2(it.x), r2(it.y), r2(it.rx), r2(it.ry), r2(it.w), r2(it.op), colorIdx(it.c), r2(it.dash == null ? -1 : it.dash), r2(it.off || 0)]));
    out.x.forEach(it => items.push([3, textId(it.t), r2(it.x), r2(it.y), r2(it.size), 0, 0, r2(it.op), colorIdx(it.c), 0, 0]));
    out.g.forEach(it => items.push([4, 0, r2(it.dx), 0, 0, 0, 0, r2(it.op), 0, 0, 0]));
    fx.push(items);
  }
  totalFrames += N;
  return { id: A.id, n: A.n, fam: A.fam, d: A.d, trail: A.trail || 0, hard: !!A.hard, frames: N, f, fx: fx.some(a => a.length) ? fx : undefined };
});

/* forme du fantôme (capuche + ailes déployées) : sert au sillage et au dédoublement */
const ghost = parsePath(I.hoodD(0, 0) + 'M-45 -15C-55 -24 -72 -18 -81 -2C-70 -4 -58 0 -46 -6ZM45 -15C55 -24 72 -18 81 -2C70 -4 58 0 46 -6Z');

const data = {
  fps: FPS, scale: SCALE, stride: STRIDE, fields: FIELDS,
  hexKeys, hex: hexKeys.map(k => I.HEX[k]),
  shapeNames, shapes, eyeNames, eyeKeys, eyes, texts,
  feath: I.FEATH.map(d => parsePath(d)), runes: I.RUNES.map(d => parsePath(d)), rim: parsePath(I.RIM), void: parsePath(I.VOID), brow: parsePath(I.BROW), ghost,
  tap: I.TAP, amb: I.AMB,
  fams: I.FAMS.map(f => ({ id: f.id, n: f.n, d: f.d })),
  anims,
};
mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify(data);
writeFileSync(resolve(OUT_DIR, 'esprit.json'), json);
console.log('animations :', anims.length, '· images :', totalFrames, '· taille :', (json.length / 1024).toFixed(0), 'Ko ->', 'modules/mimir-overlay/android/src/main/assets/esprit.json');
