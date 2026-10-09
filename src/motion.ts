/* Données et maths PURES des mouvements de Mìmir (aucune dépendance RN : testable sous Node).
   Portage fidèle de disagne/mimai-core.js : mêmes keyframes, mêmes ordres de transformation CSS
   (le premier canal d'un `ch` est le plus EXTERNE, comme `transform: A B` = A(B(p))),
   mêmes origines (transform-origin en fill-box) recalculées sur la vraie géométrie. */

export type Pt = { x: number; y: number };

/* Pivots = transform-origin CSS des maquettes, calculés sur la géométrie réelle des paths
   (bbox L : x 304→565.74, y 294.41→758 ; figure : x 304→948, y 211.6→846) :
   - armL  : 96 % / 40 % de la bbox du bras  → (555.27, 479.85)
   - armR  : 4 %  / 40 % de la bbox du bras miroir → (696.73, 479.85)
   - fig   : 50 % / 100 % de la figure → (626, 846)
   - figMid: 50 % / 55 %  de la figure → (626, 560.5)  (l'ancienne valeur 674 décentrait pirouette/salto/tourbillon…)
   - head  : 50 % / 50 % du groupe tête (étoile ×1.4 : y 211.6→424.4) → (625, 318)
   - star/eyes : centre de l'étoile (625, 328) / des yeux (625, 326). */
export const PIV = {
  armL: { x: 555.27, y: 479.85 },
  armR: { x: 696.73, y: 479.85 },
  body: { x: 625, y: 846 },
  head: { x: 625, y: 318 },
  star: { x: 625, y: 328 },
  eyes: { x: 625, y: 326 },
  fig: { x: 626, y: 846 },
  figMid: { x: 626, y: 560.5 },
} as const;
export type PivotKey = keyof typeof PIV;

/* géométrie du personnage (viewBox de base : 250 190 752 700) */
export const VB = { x: 250, y: 190, w: 752, h: 700 };

/* marge de sécurité autour du viewBox de base (unités viewBox) : issue de scripts/motion-audit.mjs */
export const ROOM = { l: 120, r: 230, t: 220, b: 130 };

/* ───────────────────────── primitives ───────────────────────── */
export type Ch =
  | ['tx' | 'ty' | 'rot' | 'scl' | 'op', number[]]
  | ['sxy', number[], number[]];
export type Prim = { keys: number[]; ch: Ch[]; linear?: boolean };

const P = (keys: number[], ch: Ch[], linear?: boolean): Prim => ({ keys, ch, linear });
const tx = (v: number[]): Ch => ['tx', v];
const ty = (v: number[]): Ch => ['ty', v];
const rot = (v: number[]): Ch => ['rot', v];
const scl = (v: number[]): Ch => ['scl', v];
const op = (v: number[]): Ch => ['op', v];
const sxy = (x: number[], y: number[]): Ch => ['sxy', x, y];

/* orbite elliptique (étourdissement) : 12 points, phase en tours */
const orbit = (phase: number, rx: number, ry: number): Prim => {
  const keys: number[] = [], xs: number[] = [], ys: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12 + phase) * Math.PI * 2;
    keys.push(i / 12); xs.push(Math.round(rx * Math.cos(a) * 10) / 10); ys.push(Math.round(ry * Math.sin(a) * 10) / 10);
  }
  return P(keys, [tx(xs), ty(ys)], true);
};

export const PRIMS: Record<string, Prim> = {
  /* corps */
  bBob: P([0, .5, 1], [ty([0, -22, 0])]),
  bHop: P([0, .3, .55, .68, .8, 1], [ty([0, -60, 0, -16, 0, 0])]),
  fJump2: P([0, .2, .4, .6, .8, 1], [ty([0, -70, 0, -70, 0, 0])]),
  fSpin: P([0, 1], [rot([0, 360])], true),
  fSpinFast: P([0, 1], [rot([0, 360])], true),
  fSway: P([0, .5, 1], [rot([-8, 8, -8])]),
  fStretch: P([0, .5, 1], [sxy([1, .92, 1], [1, 1.18, 1])]),
  fJolt: P([0, .15, .3, 1], [ty([0, -50, 0, 0]), scl([1, 1.05, 1, 1])]),
  fShake: P([0, .25, .75, 1], [tx([0, -14, 14, 0])]),
  fShiver: P([0, .5, 1], [tx([-4, 4, -4])]),
  fSquash: P([0, .3, .6, 1], [sxy([1, 1.18, .9, 1], [1, .82, 1.12, 1]), ty([0, 0, -30, 0])]),
  fFloat: P([0, .5, 1], [ty([0, -60, 0])]),
  fRock: P([0, .5, 1], [rot([-15, 15, -15])]),
  fDrop: P([0, .45, .55, .7, .85, 1], [ty([-400, 0, 0, 0, 0, 0]), sxy([1, 1, 1.25, .92, 1, 1], [1, 1, .75, 1.1, 1, 1])]),
  fSlide: P([0, .5, 1], [tx([-80, 80, -80])]),
  fPeek: P([0, .3, .7, 1], [ty([160, 0, 0, 160]), op([0, 1, 1, 0])]),
  fShrink: P([0, .4, .6, 1], [scl([1, .15, .15, 1])]),
  fRise: P([0, .5, 1], [ty([0, -110, 0])]),
  fDroop: P([0, .5, 1], [ty([0, 16, 0]), sxy([1, 1, 1], [1, .94, 1])]),
  fTilt: P([0, .5, 1], [rot([-10, -14, -10]), tx([0, -10, 0])]),
  fLean: P([0, .5, 1], [rot([0, 12, 0]), ty([0, -10, 0])]),
  bTwist: P([0, .5, 1], [sxy([1, .6, 1], [1, 1, 1])]),
  fRobot: P([0, .25, .5, .75, 1], [tx([0, -30, 0, 30, 0])]),
  fWalk: P([0, .25, .5, .75, 1], [tx([-50, -25, 0, 25, -50]), ty([0, -14, 0, -14, 0])]),
  fRun: P([0, .5, 1], [rot([-6, -6, -6]), ty([0, -24, 0])]),
  fFlip: P([0, .5, 1], [ty([0, -140, 0]), rot([0, 180, 360])]),
  fPulse: P([0, .5, 1], [scl([1, 1.14, 1])]),
  fSpring: P([0, .2, .5, .8, 1], [ty([0, 0, -120, 0, 0]), sxy([1, 1.2, .9, 1.1, 1], [1, .8, 1.12, .9, 1])]),
  fProud: P([0, .5, 1], [ty([0, -14, 0]), scl([1, 1.1, 1])]),
  fBow: P([0, .4, .6, 1], [rot([0, 28, 28, 0])]),
  fBreath: P([0, .5, 1], [sxy([1, 1.06, 1], [1, 1.08, 1])]),
  fSneeze: P([0, .2, .5, .6, .7, .85, 1], [sxy([1, .95, .95, 1, 1.2, 1, 1], [1, 1.1, 1.1, 1, .85, 1, 1]), rot([0, -6, -6, 0, 8, 0, 0]), tx([0, 0, 0, 0, 20, 0, 0])]),
  fFade: P([0, .5, 1], [op([1, .15, 1]), scl([1, .6, 1])]),
  /* bras gauche */
  bArmL: P([0, .5, 1], [rot([0, 5, 0])]),
  wL: P([0, .15, .3, .45, .6, 1], [rot([0, 16, 3, 16, 0, 0])]),
  aUpL: P([0, .5, 1], [rot([0, 22, 0])]),
  aClapL: P([0, .5, 1], [rot([0, -10, 0])]),
  aHoldL: P([0, 1], [rot([8, 8])]),
  aFlapL: P([0, .5, 1], [rot([0, 18, 0])]),
  aOutL: P([0, .5, 1], [rot([-12, -6, -12])]),
  aPunchL: P([0, .4, 1], [rot([0, -24, 0]), tx([0, 30, 0])]),
  aDownL: P([0, .5, 1], [rot([-10, -14, -10])]),
  aWiggleL: P([0, .5, 1], [rot([-6, 10, -6])]),
  aRobotL: P([0, .49, .5, 1], [rot([0, 0, 20, 20])]),
  /* bras droit */
  bArmR: P([0, .5, 1], [rot([0, -5, 0])]),
  bWave: P([0, .15, .3, .45, .6, 1], [rot([0, -16, -3, -16, 0, 0])]),
  aUpR: P([0, .5, 1], [rot([0, -22, 0])]),
  aClapR: P([0, .5, 1], [rot([0, 10, 0])]),
  aHoldR: P([0, 1], [rot([-8, -8])]),
  aFlapR: P([0, .5, 1], [rot([0, -18, 0])]),
  aOutR: P([0, .5, 1], [rot([12, 6, 12])]),
  aPunchR: P([0, .4, 1], [rot([0, 24, 0]), tx([0, -30, 0])]),
  aDownR: P([0, .5, 1], [rot([10, 14, 10])]),
  aWiggleR: P([0, .5, 1], [rot([6, -10, 6])]),
  aConductR: P([0, .25, .5, .75, 1], [rot([4, -26, -8, -30, 4])]),
  aRobotR: P([0, .49, .5, 1], [rot([-20, -20, 0, 0])]),
  /* torse */
  mmPulseB: P([0, .45, 1], [op([.2, 1, .2])]),
  /* tête */
  bListen: P([0, .5, 1], [scl([1, 1.14, 1])]),
  hNod: P([0, .5, 1], [ty([0, 14, 0])]),
  hNo: P([0, .25, .75, 1], [rot([0, -14, 14, 0])]),
  hWobble: P([0, .25, .5, .75, 1], [rot([0, 10, 0, -10, 0]), tx([0, 10, 0, -10, 0])]),
  hBounce: P([0, .5, 1], [ty([0, -70, 0])]),
  hPop: P([0, .4, .6, 1], [ty([0, -120, -120, 0]), rot([0, 90, 90, 0])]),
  hBeat: P([0, .1, .2, .3, .4, 1], [scl([1, 1.25, 1.05, 1.25, 1, 1])]),
  /* « filter: brightness » n'existe pas en SVG natif : l'éclat est un voile blanc dont l'opacité pulse */
  hFlash: P([0, .5, 1], [op([0, .65, 0])]),
  /* étoile */
  sFull: P([0, 1], [rot([0, 360])], true),
  sFast: P([0, 1], [rot([0, 360])], true),
  bSpin: P([0, .4, .7, 1], [rot([0, 0, 90, 90])]),
  mmPulseS: P([0, .45, 1], [op([.2, 1, .2])]),
  /* yeux */
  bBlink: P([0, .9, .94, 1], [sxy([1, 1, 1, 1], [1, 1, .1, 1])]),
  mmPulseL: P([0, .45, 1], [op([.2, 1, .2])]),
  mmPulseR: P([0, .45, 1], [op([.2, 1, .2])]),
  mmPulseA: P([0, .45, 1], [op([.2, 1, .2])]),
  mmPulseH: P([0, .45, 1], [op([.2, 1, .2])]),
  eSpin: P([0, 1], [rot([0, 360])], true),

  /* ── nouveaux mouvements (réactions à la secousse) ── */
  /* étourdi : le corps vacille d'un côté à l'autre en dérivant */
  fWoozy: P([0, .25, .5, .75, 1], [rot([0, -9, 0, 9, 0]), tx([0, -12, 0, 12, 0])]),
  /* atchoum : inspiration (recul + étirement), explosion (écrasement, penché en avant), contrecoup */
  fAchoo: P([0, .3, .5, .6, .75, 1], [sxy([1, .95, .95, 1.2, 1.04, 1], [1, 1.1, 1.1, .85, .97, 1]), rot([0, -6, -6, 9, -3, 0]), tx([0, -10, -10, 16, -16, 0])]),
  /* tremblement : vibration rapide */
  fRattle: P([0, .5, 1], [rot([-2.5, 2.5, -2.5]), tx([-8, 8, -8])]),
  /* étoiles en orbite au-dessus de la tête */
  orb0: orbit(0, 110, 26),
  orb1: orbit(1 / 3, 110, 26),
  orb2: orbit(2 / 3, 110, 26),
  /* texte « Atchoum ! » : apparaît à l'éternuement, monte et s'efface */
  fxText: P([0, .55, .6, .8, 1], [ty([0, 0, 0, -26, -40]), op([0, 0, 1, 1, 0])]),
  fxDropA: P([0, .58, .6, 1], [tx([0, 0, 0, 120]), ty([0, 0, 0, -20]), op([0, 0, 1, 0])]),
  fxDropB: P([0, .58, .6, 1], [tx([0, 0, 0, 100]), ty([0, 0, 0, 22]), op([0, 0, 1, 0])]),
  fxDropC: P([0, .58, .6, 1], [tx([0, 0, 0, 135]), ty([0, 0, 0, 4]), op([0, 0, 1, 0])]),
};

/* ───────────────────────── spec « prim durée délai [n] » ───────────────────────── */
export type ParsedSpec = { prim: string; dur: number; delay: number; n?: number };
export const parseSpec = (spec?: string): ParsedSpec | null => {
  if (!spec) return null;
  const [prim, d, dl, n] = spec.split(' ');
  if (!PRIMS[prim]) return null;
  const cnt = parseInt(n, 10);
  return { prim, dur: (parseFloat(d) || 1) * 1000, delay: (parseFloat(dl) || 0) * 1000, n: cnt > 0 ? cnt : undefined };
};

/* ───────────────────────── easing CSS « ease-in-out » = cubic-bezier(.42,0,.58,1) ───────────────────────── */
export const easeInOut = (x: number): number => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bez = (t: number, a: number, b: number) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (bez(m, .42, .58) < x) lo = m; else hi = m;
  }
  return bez((lo + hi) / 2, 0, 1);
};

/* En CSS l'easing s'applique à CHAQUE intervalle de keyframes (et pas à toute la boucle) : on rééchantillonne
   les clés (8 sous-points par intervalle) pour que la progression linéaire d'un seul Animated.Value rende la même courbe. */
const SUB = 8;
export const expandKeys = (keys: number[], vals: number[], linear?: boolean): { keys: number[]; vals: number[] } => {
  if (linear) return { keys, vals };
  const K: number[] = [], V: number[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i], k1 = keys[i + 1], v0 = vals[i], v1 = vals[i + 1];
    if (k1 === k0 || v1 === v0) { K.push(k0); V.push(v0); continue; }
    for (let j = 0; j < SUB; j++) {
      const u = j / SUB;
      K.push(k0 + (k1 - k0) * u); V.push(v0 + (v1 - v0) * easeInOut(u));
    }
  }
  K.push(keys[keys.length - 1]); V.push(vals[vals.length - 1]);
  /* clés strictement croissantes sauf plateaux voulus : on supprime les doublons exacts consécutifs identiques */
  return { keys: K, vals: V };
};

/* valeur d'un canal à l'instant t∈[0,1] (même rééchantillonnage que le rendu) */
export const sampleCh = (keys: number[], vals: number[], linear: boolean | undefined, t: number): number => {
  const e = expandKeys(keys, vals, linear);
  if (t <= e.keys[0]) return e.vals[0];
  for (let i = 1; i < e.keys.length; i++) {
    if (t <= e.keys[i]) {
      const k0 = e.keys[i - 1], k1 = e.keys[i];
      return k1 === k0 ? e.vals[i] : e.vals[i - 1] + (e.vals[i] - e.vals[i - 1]) * ((t - k0) / (k1 - k0));
    }
  }
  return e.vals[e.vals.length - 1];
};

/* ───────────────────────── affines (audit géométrique) ───────────────────────── */
export type Mat = [number, number, number, number, number, number]; // a b c d e f (SVG)
export const I: Mat = [1, 0, 0, 1, 0, 0];
export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const T = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
const Rm = (deg: number): Mat => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; };
const Sm = (x: number, y: number): Mat => [x, 0, 0, y, 0, 0];
const around = (p: Pt, m: Mat) => mul(mul(T(p.x, p.y), m), T(-p.x, -p.y));

/* matrice (externe → interne) d'une primitive à t, autour du pivot ; opacité en second retour */
export const primMatrix = (prim: Prim, t: number, pivot: Pt): { m: Mat; opacity: number } => {
  let m: Mat = I; let opacity = 1;
  for (const c of prim.ch) {
    const s = (v: number[]) => sampleCh(prim.keys, v, prim.linear, t);
    let l: Mat = I;
    if (c[0] === 'tx') l = T(s(c[1]), 0);
    else if (c[0] === 'ty') l = T(0, s(c[1]));
    else if (c[0] === 'rot') l = around(pivot, Rm(s(c[1])));
    else if (c[0] === 'scl') { const k = s(c[1]); l = around(pivot, Sm(k, k)); }
    else if (c[0] === 'sxy') l = around(pivot, Sm(s(c[1]), s(c[2])));
    else if (c[0] === 'op') opacity *= s(c[1]);
    m = mul(m, l);
  }
  return { m, opacity };
};

/* ───────────────────────── mouvements ───────────────────────── */
export type MoveSpec = {
  n: string; f?: string; l?: string; r?: string; b?: string; h?: string; s?: string; e?: string;
  eyes?: 'open' | 'happy' | 'closed' | 'wink' | 'up' | 'down' | 'wide' | 'dizzy';
  tone?: 'dim' | 'frost'; fo?: 'mid';
  /* effets annexes dessinés autour du personnage */
  fx?: 'dizzy' | 'sneeze';
  /* nombre de cycles de chaque spec en lecture unique (défaut 1) */
  rep?: number;
  /* réaction possible à la secousse du téléphone */
  shake?: boolean;
};

export const MOVES: MoveSpec[] = [
  { n: 'Repos', f: 'bBob 3', l: 'bArmL 3', r: 'bArmR 3', e: 'bBlink 4' },
  { n: 'Salut', f: 'bBob 3', r: 'bWave 1.8', e: 'bBlink 4' },
  { n: 'Salut à gauche', f: 'bBob 3', l: 'wL 1.8', e: 'bBlink 4' },
  { n: 'Grand salut', l: 'wL 1.6', r: 'bWave 1.6', eyes: 'happy' },
  { n: 'Saut de joie', f: 'bHop 1.6', s: 'bSpin 1.6', eyes: 'happy', shake: true },
  { n: 'Double saut', f: 'fJump2 1.4', eyes: 'happy' },
  { n: 'Pirouette', f: 'fSpin 2', fo: 'mid', shake: true },
  { n: 'Tête-toupie', s: 'sFull 1.2' },
  { n: 'Danse', f: 'fSway 1', l: 'aUpL 1', r: 'aUpR 1 .5', eyes: 'happy', shake: true },
  { n: 'Applaudir', l: 'aClapL .5', r: 'aClapR .5', eyes: 'happy' },
  { n: 'Étirement', f: 'fStretch 2.4', l: 'aUpL 2.4', r: 'aUpR 2.4' },
  { n: 'Bâillement', f: 'fStretch 3', eyes: 'closed' },
  { n: 'Sommeil', f: 'bBob 5', eyes: 'closed', tone: 'dim' },
  { n: 'Réflexion', l: 'mmPulseL 1.5', b: 'mmPulseB 1.5 .2', r: 'mmPulseR 1.5 .4', h: 'bListen 1.5', eyes: 'up' },
  { n: 'Écoute', h: 'bListen 1.1', l: 'aHoldL 1', r: 'aHoldR 1' },
  { n: 'Surprise', f: 'fJolt 1.2', eyes: 'wide', shake: true },
  { n: 'Fou rire', f: 'fShake .35', eyes: 'happy' },
  { n: 'Clin d’œil', f: 'bBob 3', eyes: 'wink' },
  { n: 'Oui', h: 'hNod .8' },
  { n: 'Non', h: 'hNo .8' },
  { n: 'Frisson', f: 'fShiver .15', eyes: 'wide' },
  { n: 'Rebond', f: 'fSquash .7' },
  { n: 'Flotte', f: 'fFloat 3.5', l: 'bArmL 3.5', r: 'bArmR 3.5' },
  { n: 'Balancier', f: 'fRock 2' },
  { n: 'Battements', l: 'aFlapL .3', r: 'aFlapR .3' },
  { n: 'Envol', f: 'fFloat 2', l: 'aFlapL .3', r: 'aFlapR .3' },
  { n: 'Atterrissage', f: 'fDrop 1.8' },
  { n: 'Glissade', f: 'fSlide 2.4' },
  { n: 'Coucou', f: 'fPeek 2.2', eyes: 'happy' },
  { n: 'Cache-cache', f: 'fShrink 2.4', fo: 'mid' },
  { n: 'Étoile filante', s: 'sFast .5', h: 'hFlash 1' },
  { n: 'Super-héros', f: 'fRise 2', l: 'aUpL 2', r: 'aUpR 2' },
  { n: 'Méditation', f: 'fFloat 4', l: 'aOutL 4', r: 'aOutR 4', eyes: 'closed' },
  { n: 'Boxe', l: 'aPunchL .5', r: 'aPunchR .5 .25' },
  { n: 'Victoire', f: 'bHop 1.2', l: 'aUpL 1.2', r: 'aUpR 1.2', eyes: 'happy' },
  { n: 'Triste', f: 'fDroop 3', l: 'aDownL 3', r: 'aDownR 3', eyes: 'down' },
  { n: 'Timide', f: 'fTilt 2.5', eyes: 'down' },
  { n: 'Curieux', f: 'fLean 2', eyes: 'up' },
  { n: 'Tête qui tourne', h: 'hWobble 1.4' },
  { n: 'Hula', b: 'bTwist .8', f: 'fSway .8', eyes: 'happy' },
  { n: 'Robot', f: 'fRobot 1.2', l: 'aRobotL 1.2', r: 'aRobotR 1.2' },
  { n: 'Marche', f: 'fWalk 1.6', l: 'bArmL .8', r: 'bArmR .8' },
  { n: 'Course', f: 'fRun .4', l: 'aFlapL .4', r: 'aFlapR .4' },
  { n: 'Tourbillon', f: 'fSpinFast .6', eyes: 'closed', fo: 'mid' },
  { n: 'Salto', f: 'fFlip 1.4', eyes: 'happy', fo: 'mid' },
  { n: 'Pulsation', f: 'fPulse 1.2', fo: 'mid' },
  { n: 'Cœur battant', h: 'hBeat 1', eyes: 'happy' },
  { n: 'Éclat', h: 'hFlash 1.2', s: 'bSpin 1.2' },
  { n: 'Ressort', f: 'fSpring 1.1' },
  { n: 'Gelé', f: 'fShiver .12', eyes: 'wide', tone: 'frost' },
  { n: 'Fier', f: 'fProud 2.4', eyes: 'happy' },
  { n: 'Révérence', f: 'fBow 2', eyes: 'closed' },
  { n: 'Tête volante', h: 'hPop 1.6', eyes: 'wide' },
  { n: 'Antennes', l: 'aWiggleL .4', r: 'aWiggleR .4' },
  { n: 'Chef d’orchestre', r: 'aConductR 1', l: 'bArmL 2', eyes: 'closed' },
  { n: 'Jongle', h: 'hBounce .8', eyes: 'up' },
  { n: 'Vague', l: 'aUpL 1.5', b: 'mmPulseB 1.5 .25', r: 'aUpR 1.5 .5' },
  { n: 'Zen', f: 'fBreath 4', eyes: 'closed', fo: 'mid' },
  { n: 'Éternuement', f: 'fSneeze 1.8', eyes: 'closed' },
  { n: 'Au revoir', r: 'bWave 1.4', f: 'fFade 2.8', fo: 'mid' },
  /* ── nouveautés (60-62) : réactions à la secousse ── */
  { n: 'Étourdi', f: 'fWoozy 1.2 0 3', h: 'hWobble .6 0 6', eyes: 'dizzy', fx: 'dizzy', shake: true },
  { n: 'Atchoum', f: 'fAchoo 1.6', eyes: 'closed', fx: 'sneeze', rep: 2, shake: true },
  { n: 'Tremblement', f: 'fRattle .09 0 20', l: 'aFlapL .12 0 15', r: 'aFlapR .12 0 15', eyes: 'wide', shake: true },
];

export const moveIndex = (n: string) => Math.max(0, MOVES.findIndex(m => m.n === n));

/* spec des effets annexes (même moteur) : [spec, rôle] */
export const FX_SPECS: Record<NonNullable<MoveSpec['fx']>, (rep: number) => string[]> = {
  dizzy: () => ['orb0 1.2 0 3', 'orb1 1.2 0 3', 'orb2 1.2 0 3'],
  sneeze: () => ['fxText 1.6', 'fxDropA 1.6', 'fxDropB 1.6', 'fxDropC 1.6'],
};

/* réactions possibles à une secousse : mouvement (par nom) + nombre de cycles pour la lecture unique */
export const SHAKE_REACTIONS: { n: string; rep?: number }[] = [
  { n: 'Étourdi' },
  { n: 'Atchoum' },
  { n: 'Danse', rep: 3 },
  { n: 'Saut de joie', rep: 2 },
  { n: 'Pirouette' },
  { n: 'Tremblement' },
  { n: 'Surprise', rep: 2 },
];

const FIELDS = ['f', 'l', 'r', 'b', 'h', 's'] as const;
const FIGURE_SPECS = (m: MoveSpec, rep: number): string[] => {
  const out: string[] = [];
  for (const k of FIELDS) { const s = m[k]; if (s) out.push(s); }
  if (m.fx) out.push(...FX_SPECS[m.fx](rep));
  return out;
};

/* durée (ms) d'une lecture unique : le plus long des canaux (hors clignement des yeux) */
export const moveOnceMs = (m: MoveSpec, rep?: number): number => {
  const mult = rep ?? m.rep ?? 1;
  let max = 0;
  for (const s of FIGURE_SPECS(m, mult)) {
    const p = parseSpec(s);
    if (p) max = Math.max(max, p.delay + p.dur * (p.n ?? mult));
  }
  return max || 1000;
};

/* choisit une réaction ≠ la précédente */
export const pickReaction = (last: number, rnd: () => number = Math.random): number => {
  const n = SHAKE_REACTIONS.length;
  let i = Math.floor(rnd() * n) % n;
  if (n > 1 && i === last) i = (i + 1 + Math.floor(rnd() * (n - 1))) % n;
  return i;
};

/* tracé d'une spirale (yeux étourdis) */
export const spiralPath = (cx: number, cy: number, r: number, turns = 2.2, steps = 36): string => {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, a = u * turns * Math.PI * 2, rr = r * u;
    d += (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(1) + ' ' + (cy + rr * Math.sin(a)).toFixed(1);
  }
  return d;
};

/* ═════════════ évaluation numérique directe (moteur d'animation à matrices) ═════════════
   Remplace l'ancien pipeline « Animated.interpolate → chaîne `translate() rotate() translate()` → extractTransform (parseur PEG) »
   par un calcul direct de la matrice [a b c d e f] à partir du temps normalisé t∈[0,1]. Mêmes clés rééchantillonnées
   (expandKeys), même interpolation linéaire par intervalle que Animated.interpolate, même ordre de composition (externe → interne). */

/* interpolation linéaire par morceaux, sémantique d'Animated.interpolate (extrapolation « extend ») */
const lerpAt = (K: number[], V: number[], t: number): number => {
  const n = K.length;
  let i = 1;
  for (; i < n - 1; i++) if (K[i] >= t) break;
  const r = i - 1, k0 = K[r], k1 = K[r + 1];
  if (k0 === k1) return t <= k0 ? V[r] : V[r + 1];
  return V[r] + (V[r + 1] - V[r]) * ((t - k0) / (k1 - k0));
};

type Series = { K: number[]; V: number[] };
type CChan = { kind: 'tx' | 'ty' | 'rot' | 'scl' | 'op'; a: Series } | { kind: 'sxy'; a: Series; b: Series };

export type Frame = { m: Mat | null; op: number | null };
export type Compiled = {
  dur: number; delay: number; n?: number;
  /** aucune valeur ne varie : le rendu initial suffit, aucun abonnement à l'horloge */
  constant: boolean;
  hasM: boolean; hasOp: boolean;
  at: (t: number) => Frame;
};

const S: number[] = [1, 0, 0, 1, 0, 0]; // accumulateur partagé (usage synchrone uniquement)
const appS = (la: number, lb: number, lc: number, ld: number, le: number, lf: number) => {
  const a = S[0], b = S[1], c = S[2], d = S[3];
  S[4] = a * le + c * lf + S[4]; S[5] = b * le + d * lf + S[5];
  S[0] = a * la + c * lb; S[1] = b * la + d * lb;
  S[2] = a * lc + c * ld; S[3] = b * lc + d * ld;
};
const appScale = (sx: number, sy: number, p: Pt) => appS(sx, 0, 0, sy, p.x * (1 - sx), p.y * (1 - sy));

const compiledCache = new Map<string, Compiled>();

export const compileMotion = (parsed: ParsedSpec, pivot: Pt): Compiled => {
  const key = `${parsed.prim}|${parsed.dur}|${parsed.delay}|${parsed.n ?? ''}|${pivot.x}|${pivot.y}`;
  const hit = compiledCache.get(key);
  if (hit) return hit;
  const prim = PRIMS[parsed.prim];
  const ser = (vals: number[]): Series => { const e = expandKeys(prim.keys, vals, prim.linear); return { K: e.keys, V: e.vals }; };
  const chans: CChan[] = prim.ch.map((c): CChan => c[0] === 'sxy' ? { kind: 'sxy', a: ser(c[1]), b: ser(c[2]) } : { kind: c[0], a: ser(c[1]) });
  const hasM = chans.some(c => c.kind !== 'op');
  const hasOp = chans.some(c => c.kind === 'op');
  const flat = (s: Series) => s.V.every(v => v === s.V[0]);
  const constant = chans.every(c => flat(c.a) && (c.kind !== 'sxy' || flat(c.b)));
  const at = (t0: number): Frame => {
    const t = t0 < 0 ? 0 : t0 > 1 ? 1 : t0;
    S[0] = 1; S[1] = 0; S[2] = 0; S[3] = 1; S[4] = 0; S[5] = 0;
    let op: number | null = null;
    for (const c of chans) {
      switch (c.kind) {
        case 'tx': appS(1, 0, 0, 1, lerpAt(c.a.K, c.a.V, t), 0); break;
        case 'ty': appS(1, 0, 0, 1, 0, lerpAt(c.a.K, c.a.V, t)); break;
        case 'rot': {
          const r = lerpAt(c.a.K, c.a.V, t) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
          appS(cs, sn, -sn, cs, pivot.x - cs * pivot.x + sn * pivot.y, pivot.y - sn * pivot.x - cs * pivot.y);
          break;
        }
        case 'scl': { const k = lerpAt(c.a.K, c.a.V, t); appScale(k, k, pivot); break; }
        case 'sxy': appScale(lerpAt(c.a.K, c.a.V, t), lerpAt(c.b.K, c.b.V, t), pivot); break;
        case 'op': op = (op ?? 1) * lerpAt(c.a.K, c.a.V, t); break;
      }
    }
    return { m: hasM ? [S[0], S[1], S[2], S[3], S[4], S[5]] : null, op };
  };
  const out: Compiled = { dur: parsed.dur, delay: parsed.delay, n: parsed.n, constant, hasM, hasOp, at };
  compiledCache.set(key, out);
  return out;
};

/* temps normalisé d'un spec après `elapsed` ms de lecture (délai appliqué une seule fois ; lecture unique : n cycles puis arrêt à t=1) */
export const phaseAt = (delay: number, dur: number, once: boolean, count: number, elapsed: number): { t: number; done: boolean } => {
  if (elapsed < delay) return { t: 0, done: false };
  const x = elapsed - delay;
  if (once && x >= dur * count) return { t: 1, done: true };
  return { t: (x % dur) / dur, done: false };
};

/* instant « image fixe » représentatif d'un mouvement (vignettes statiques) : pose expressive mais lisible
   (figure visible, pas retournée, pas écrasée, pas hors cadre) */
export const stillTime = (m: MoveSpec): number => {
  const fp = parseSpec(m.f);
  if (!fp) return .5;
  const c = compileMotion(fp, PIV[m.fo === 'mid' ? 'figMid' : 'fig']);
  for (const t of [.5, .35, .2]) {
    const fr = c.at(t);
    if (fr.op !== null && fr.op < .9) continue;
    if (fr.m) {
      const [a, b, cc, d, e, f] = fr.m;
      const ang = Math.abs(Math.atan2(b, a)) * 180 / Math.PI;
      const sc = Math.sqrt(Math.abs(a * d - b * cc));
      const px = a * 626 + cc * 560 + e - 626, py = b * 626 + d * 560 + f - 560;
      if (ang > 60 || sc < .6 || Math.hypot(px, py) > 200) continue;
    }
    return t;
  }
  return 0;
};

/* ═════════════ horloge partagée (une seule boucle requestAnimationFrame pour toute l'app) ═════════════ */
export type TickerEnv = { raf: (cb: (ts: number) => void) => unknown; caf: (h: unknown) => void };
type TickSub = { minDt: number; last: number; fn: (dt: number) => boolean | void };
export const createTicker = (env: TickerEnv, hooks: { onBusy?: () => void; onIdle?: () => void } = {}) => {
  const subs = new Set<TickSub>();
  let handle: unknown = null, paused = false;
  const frame = (ts: number) => {
    handle = null;
    for (const s of Array.from(subs)) {
      if (s.last < 0) { s.last = ts; continue; }
      const dt = ts - s.last;
      if (dt < s.minDt - 4) continue;
      s.last = ts;
      if (s.fn(Math.min(dt, 100)) === true) { subs.delete(s); }
    }
    if (!subs.size) { hooks.onIdle?.(); return; }
    if (!paused) handle = env.raf(frame);
  };
  const kick = () => { if (handle === null && !paused && subs.size) handle = env.raf(frame); };
  return {
    /** minDt : intervalle minimal entre deux appels (ms) ; fn(dt) renvoie true pour se désabonner */
    add(minDt: number, fn: (dt: number) => boolean | void): () => void {
      const s: TickSub = { minDt, last: -1, fn };
      if (!subs.size) hooks.onBusy?.();
      subs.add(s); kick();
      return () => {
        subs.delete(s);
        if (!subs.size) { if (handle !== null) { env.caf(handle); handle = null; } hooks.onIdle?.(); }
      };
    },
    setPaused(p: boolean) {
      if (p === paused) return;
      paused = p;
      if (p) { if (handle !== null) { env.caf(handle); handle = null; } }
      else { subs.forEach(s => { s.last = -1; }); kick(); }
    },
    size: () => subs.size,
    running: () => handle !== null,
  };
};
