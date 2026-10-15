/* L’esprit gardien : le personnage du mode en ligne. 156 animations à lui, capteurs partagés avec l’étoile. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, flo = Math.floor, pow = Math.pow, exp = Math.exp, sqrt = Math.sqrt;
  const cl = (v, a, b) => v < a ? a : v > b ? b : v;
  const seg = (p, a, b) => cl((p - a) / (b - a), 0, 1);
  const ss = t => t * t * (3 - 2 * t);
  const io = t => t < .5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2;
  const oc = t => 1 - pow(1 - t, 3);
  const sn = t => .5 - .5 * cos(PI * t);
  const EZ = { io, oc, ss, sn, lin: t => t };
  const env = (p, a, b) => ss(cl(min(p / (a || .12), (1 - p) / (b || .18)), 0, 1));
  const bell = (p, c, w) => { if (c == null) c = .5; if (w == null) w = .5; const u = (p - c) / w; return abs(u) >= 1 ? 0 : .5 + .5 * cos(PI * u); };
  const rnd = (i, k) => { const v = sin(i * 91.7 + k * 47.3 + 3.1) * 24634.6345; return v - flo(v); };
  const wav = (t, s) => sin(t * 1.7 + s) * .5 + sin(t * 2.9 + s * 1.3) * .3 + sin(t * 5.3 + s * 2.1) * .2;
  const f1 = v => String(Math.round(v * 10) / 10);
  const nA = r => ((r % 360) + 540) % 360 - 180;

  /* ---------- couleurs : bleu nuit, yeux et runes cyan ---------- */
  const HEX = { c1: '#eaf6ff', c2: '#c8e7ff', c3: '#9ad1ff', c4: '#6cb8ff', c5: '#479ef7', c6: '#2f82e3', c7: '#2465bd', c8: '#1b4888', c9: '#132f5a', cy: '#62e2ff', aq: '#5cf2d0', in: '#6f7cff', vi: '#a07dff', wh: '#ffffff', gl: '#e2f5ff', h1: '#8d93a1', h2: '#686e7c', h3: '#4c515e', h4: '#2f333c', r1: '#d6d9e1', r2: '#a8adb8', r3: '#777c88', vd: '#05060a', pu: '#123b9a' };
  const toLin = c => { c /= 255; return c <= .04045 ? c / 12.92 : pow((c + .055) / 1.055, 2.4); };
  const toS = c => { const v = c <= .0031308 ? 12.92 * c : 1.055 * pow(c, 1 / 2.4) - .055; return Math.round(cl(v, 0, 1) * 255); };
  function lab(h) { h = h.replace('#', ''); const r = toLin(parseInt(h.slice(0, 2), 16)), g = toLin(parseInt(h.slice(2, 4), 16)), b = toLin(parseInt(h.slice(4, 6), 16)); const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b); return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s]; }
  function rgb(c) { const l_ = c[0] + .3963377774 * c[1] + .2158037573 * c[2], m_ = c[0] - .1055613458 * c[1] - .0638541728 * c[2], s_ = c[0] - .0894841775 * c[1] - 1.291485548 * c[2]; const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_; return 'rgb(' + toS(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s) + ',' + toS(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s) + ',' + toS(-.0041960863 * l - .7034186147 * m + 1.707614701 * s) + ')'; }
  const mix = (a, b, t) => t <= 0 ? a : t >= 1 ? b : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const L = {}; Object.keys(HEX).forEach(k => { L[k] = lab(HEX[k]); });

  /* ---------- le personnage (unités : capuche de 114 de haut) ---------- */
  const hoodD = (tx, th) => { const ty = -57 - th; return 'M' + f1(tx - 5) + ' ' + f1(ty + 3) + 'Q' + f1(tx) + ' ' + f1(ty - 1.5) + ' ' + f1(tx + 5) + ' ' + f1(ty + 3) + 'C' + f1(tx + 14) + ' ' + f1(ty + 11) + ' ' + f1(32 + tx * .25) + ' -35 44 -22C54 -12 59 8 58 24C57 36 48 44 38 48L4 57Q0 58.5 -4 57L-38 48C-48 44 -57 36 -58 24C-59 8 -54 -12 -44 -22C' + f1(-32 + tx * .25) + ' -35 ' + f1(tx - 14) + ' ' + f1(ty + 11) + ' ' + f1(tx - 5) + ' ' + f1(ty + 3) + 'Z'; };
  const shadeD = (tx, th) => { const ty = -57 - th; return 'M' + f1(tx) + ' ' + f1(ty - .5) + 'C' + f1(tx + 14) + ' ' + f1(ty + 11) + ' ' + f1(32 + tx * .25) + ' -35 44 -22C54 -12 59 8 58 24C57 36 48 44 38 48L4 57L0 -30Z'; };
  const RIM = 'M0 -31C8 -25 36 -3 46 11C53 22 51 34 41 42L4 55Q0 57 -4 55L-41 42C-51 34 -53 22 -46 11C-36 -3 -8 -25 0 -31Z';
  const VOID = 'M0 -24C7 -19 31 -2 40 11C45 20 43 30 35 37L3 49Q0 50.5 -3 49L-35 37C-43 30 -45 20 -40 11C-31 -2 -7 -19 0 -24Z';
  const GHOST = hoodD(0, 0) + 'M-45 -15C-55 -24 -72 -18 -81 -2C-70 -4 -58 0 -46 -6ZM45 -15C55 -24 72 -18 81 -2C70 -4 58 0 46 -6Z';
  const FEATH = ['M2 -4C-8 -9 -23 -6 -36 13C-26 9 -12 7 1 5Z', 'M1 1C-9 1 -21 6 -30 19C-20 15 -10 13 1 9Z', 'M0 6C-8 8 -16 12 -22 21C-14 18 -7 16 1 12Z'];
  const RUNES = ['M1.5 -6L-4.5 3.5L2.5 5', 'M0 -9L5.5 -1.5L0 2.5L-5.5 -1.5ZM0 -1V12', 'M-1.5 -6L4.5 3.5L-2.5 5'];
  const BROW = 'M-6 2Q-1 -3.2 6 -1';
  const SHAPES = {
    open: [{ t: 'ellipse', a: { rx: 9.6, ry: 12.4 }, k: 'iris' }, { t: 'ellipse', a: { cx: 1.4, cy: -1.6, rx: 5.2, ry: 7.2 }, k: 'pup', m: 1 }, { t: 'circle', a: { cx: -3.4, cy: -5.4, r: 2.7 }, k: 'hi', m: 1 }, { t: 'circle', a: { cx: 3.6, cy: 5.6, r: 1.15 }, k: 'hi2', m: 1 }],
    point: [{ t: 'circle', a: { r: 3.6 }, k: 'fi' }],
    happy: [{ t: 'path', a: { d: 'M-8.5 3.5Q0 -9 8.5 3.5' }, k: 'st', w: 4.4 }],
    closed: [{ t: 'path', a: { d: 'M-8.5 1Q0 3.6 8.5 1' }, k: 'st', w: 3.8 }],
    croissant: [{ t: 'path', a: { d: 'M-9.5 -2Q0 12 9.5 -2Q0 6 -9.5 -2Z' }, k: 'fi' }],
    losange: [{ t: 'path', a: { d: 'M0 -12.5L8.2 0L0 12.5L-8.2 0Z' }, k: 'iris' }, { t: 'circle', a: { cx: -2.4, cy: -4.4, r: 2.1 }, k: 'hi', m: 1 }],
    anneau: [{ t: 'ellipse', a: { rx: 7.6, ry: 9.4 }, k: 'ring', w: 3.4 }],
    scan: [{ t: 'rect', a: { x: -10, y: -2.3, width: 20, height: 4.6, rx: 2.3 }, k: 'fi' }],
    coeur: [{ t: 'path', a: { d: 'M0 9.5C-6.5 5 -10.5 1.2 -10.5 -3.6C-10.5 -7.3 -7.8 -9.4 -5.2 -9.4C-2.6 -9.4 -1 -7.8 0 -6.3C1 -7.8 2.6 -9.4 5.2 -9.4C7.8 -9.4 10.5 -7.3 10.5 -3.6C10.5 1.2 6.5 5 0 9.5Z' }, k: 'fi' }, { t: 'circle', a: { cx: -4.6, cy: -4.6, r: 1.9 }, k: 'hi' }],
    eteint: [{ t: 'circle', a: { r: 2.2 }, k: 'dim' }]
  };
  const expr = (key, sd) => key === 'wide' ? ['open', 1.16] : key === 'small' ? ['open', .7] : key === 'clin' ? (sd < 0 ? ['open', 1] : ['happy', 1]) : [SHAPES[key] ? key : 'open', 1];

  /* ---------- formes des effets (rayon 10) ---------- */
  const SH = {
    plume: 'M0 -10C5 -5 5.5 3 0 10C-1.5 5 -4.5 3 -3.5 -2C-2.5 -6 -1 -8.5 0 -10Z',
    follet: 'M0 10C-6 10 -7 3 -4 -2C-2 -5 -2.5 -8 0 -10C1.5 -6 6 -4 6 3C6 7 3 10 0 10Z',
    losange: 'M0 -10L7 0L0 10L-7 0ZM0 -6.2L-4.3 0L0 6.2L4.3 0Z',
    losfin: 'M0 -10L7 0L0 10L-7 0ZM0 -9.1L-6.35 0L0 9.1L6.35 0Z',
    rune: 'M0 -10L6 -2L1.3 2.4V10H-1.3V2.4L-6 -2ZM0 -6.3L-3.5 -2L0 .9L3.5 -2Z',
    chev: 'M2 -9L-6 2L4 6L4.9 3.6L-2.5 1L4.4 -7.7Z',
    octet: 'M-4 -4H4V4H-4Z',
    arc: 'M-10 0A10 10 0 0 1 10 0H7A7 7 0 0 0 -7 0Z',
    nuage: 'M-9 5A4.5 4.5 0 0 1 -7 -3A6 6 0 0 1 4 -6A5 5 0 0 1 9 2A3.5 3.5 0 0 1 7 5Z',
    eclair: 'M2 -10L-4 -1H0L-3 10L5 -2H1L4 -10Z',
    bouclier: 'M0 -10L8 -6V0C8 5 4 8 0 10C-4 8 -8 5 -8 0V-6ZM0 -6.6L-4.8 -4.1V0C-4.8 3 -2.6 5 0 6.3C2.6 5 4.8 3 4.8 0V-4.1Z',
    globe: 'M0 -10A10 10 0 1 1 0 10A10 10 0 1 1 0 -10ZM0 -7.8A7.8 7.8 0 1 0 0 7.8A7.8 7.8 0 1 0 0 -7.8ZM-1 -8H1V8H-1ZM-8 -1H8V1H-8ZM0 -8A4.2 8 0 1 1 0 8A4.2 8 0 1 1 0 -8ZM0 -6.5A2.7 6.5 0 1 0 0 6.5A2.7 6.5 0 1 0 0 -6.5Z',
    loupe: 'M-2 -10A7 7 0 1 1 -2 4A7 7 0 1 1 -2 -10ZM-2 -7.6A4.6 4.6 0 1 0 -2 1.6A4.6 4.6 0 1 0 -2 -7.6ZM2.6 1.4L4.6 -.6L10 4.8L8 6.8Z',
    fleche: 'M-2.6 -10H2.6V1H7L0 10L-7 1H-2.6Z',
    coche: 'M-8.5 -.5L-5.6 -3.4L-2 .2L5.6 -7.4L8.5 -4.5L-2 6Z',
    croix: 'M-7 -4.4L-4.4 -7L0 -2.6L4.4 -7L7 -4.4L2.6 0L7 4.4L4.4 7L0 2.6L-4.4 7L-7 4.4L-2.6 0Z',
    coeur: 'M0 9C-6 4.5 -10 1 -10 -3.5C-10 -7 -7.5 -9 -5 -9C-2.5 -9 -1 -7.5 0 -6C1 -7.5 2.5 -9 5 -9C7.5 -9 10 -7 10 -3.5C10 1 6 4.5 0 9Z',
    lettre: 'M-10 -7H10V7H-10ZM-8.2 -4.6V5.2H8.2V-4.6L0 1.6Z',
    cadenas: 'M-7 -1H7V10H-7ZM-5 -1V-4A5 5 0 0 1 5 -4V-1H2.6V-4A2.6 2.6 0 0 0 -2.6 -4V-1Z',
    page: 'M-7 -10H4L7 -7V10H-7ZM-4.6 -5V-3.4H3V-5ZM-4.6 -1V.6H4.6V-1ZM-4.6 3V4.6H4.6V3Z',
    point: 'M-6 0A6 6 0 1 0 6 0A6 6 0 1 0 -6 0Z',
    faisceau: 'M-2.5 -10H2.5L10 10H-10Z',
    brume: 'M-10 0A10 6 0 1 0 10 0A10 6 0 1 0 -10 0Z'
  };

  /* ---------- son vocabulaire de mouvements ---------- */
  const M = {
    flot: (a = .05, n = 2) => p => ({ y: -a * sin(TAU * n * p) * env(p, .1, .15) }),
    monte: (h = .45, c = .5, w = .5) => p => ({ y: -h * bell(p, c, w) }),
    coule: (h = .25, c = .5, w = .5) => p => ({ y: h * bell(p, c, w) }),
    va: (dx = .5, dy = 0, c = .5, w = .5, lean = 14) => p => { const b = bell(p, c, w), d = (bell(min(1, p + .01), c, w) - bell(max(0, p - .01), c, w)) / .02; return { x: dx * b, y: dy * b, r: cl(d * (dx >= 0 ? 1 : -1) * lean * .18, -20, 20) }; },
    chemin: (pts, lean = 14, e = 'sn') => { const P = [[0, 0]].concat(pts, [[0, 0]]), N = P.length - 1; const at = q => { const i = min(N - 1, flo(q)), f = q - i, a = P[max(0, i - 1)], b = P[i], c = P[i + 1], d = P[min(N, i + 2)]; const cr = (A, B, C, D) => .5 * (2 * B + (-A + C) * f + (2 * A - 5 * B + 4 * C - D) * f * f + (-A + 3 * B - 3 * C + D) * f * f * f); return [cr(a[0], b[0], c[0], d[0]), cr(a[1], b[1], c[1], d[1])]; }; return p => { const q = EZ[e](p) * N, A = at(q), B = at(min(N, q + .05)); return { x: A[0], y: A[1], r: cl((B[0] - A[0]) * 20 * lean, -24, 24) }; }; },
    boucle: (R = .5) => p => { const q = io(p); return { x: .28 * R * sin(TAU * q), y: -R * (1 - cos(TAU * q)), r: 360 * q }; },
    spirale: (R = .4, n = 2, h = .6) => p => { const q = sn(p), e = env(p, .1, .15), a = TAU * n * q; return { x: R * sin(a) * e, y: -h * bell(p, .5, .5), s: 1 - .1 * (1 - cos(a)) * e }; },
    vague: (a = .1, n = 2) => p => { const e = env(p); return { y: a * sin(TAU * n * p) * e, r: 7 * cos(TAU * n * p) * e }; },
    erre: (ax = .35, ay = .2, sd = 1) => p => { const e = env(p, .1, .15); return { x: ax * wav(p * 7, sd) * e, y: (ay * wav(p * 8, sd + 5) - .1) * e }; },
    lanterne: (a = 16, n = 2) => p => ({ pr: a * sin(TAU * n * p) * (1 - p) * min(1, p / .12) }),
    fantome: (n = 4, d = .7) => p => ({ op: 1 - d * pow(abs(sin(PI * n * p)), 4) * env(p, .05, .1) }),
    dissout: (c = .5, w = .38) => p => { const b = bell(p, c, w); return { op: 1 - b, sy: 1 + .45 * b, sx: 1 - .3 * b, y: -.35 * b }; },
    forme: (a = .45) => p => { if (p < a * .4) { const q = ss(seg(p, 0, a * .3)); return { op: 1 - q, sy: 1 + .3 * q, sx: 1 - .2 * q, y: -.2 * q }; } const q = seg(p, a * .4, a + .2), k = 1 - oc(q); return { op: ss(q), sy: 1 + .4 * k, sx: 1 - .3 * k, y: .3 * k }; },
    noir: (c = .5, w = .42) => p => ({ bop: 1 - bell(p, c, w) }),
    portail: () => p => { if (p < .1) return {}; if (p < .4) { const q = io(seg(p, .1, .4)); return { y: .9 * q, sy: 1 - .5 * q, sx: 1 + .15 * q, op: 1 - seg(q, .6, 1) }; } if (p < .55) return { op: 0 }; const q = seg(p, .55, 1), e = oc(q); return { y: -1.1 * (1 - e), op: ss(seg(q, 0, .2)), sy: 1 + .15 * (1 - e) }; },
    glitch: (n = 6) => p => { const e = env(p, .05, .1), k = flo(p * n * 4); return rnd(k, 3) > .55 ? { x: (rnd(k, 1) - .5) * .2 * e, op: 1 - .55 * e, sx: 1 + .08 * e } : {}; },
    rideau: () => p => { if (p < .28) { const q = io(p / .28); return { y: -1.5 * q, op: 1 - seg(q, .75, 1) }; } if (p < .38) return { y: -1.5, op: 0 }; const q = seg(p, .38, 1), e = oc(q), w = 22 * (1 - q) * ss(seg(q, 0, .2)); return { y: -1.5 * (1 - e), op: ss(seg(q, 0, .15)), wl: w, wr: w }; },
    plongeon: (s = .3) => p => { const b = bell(p, .45, .4); return { s: 1 - (1 - s) * b, y: -.25 * b, op: 1 - .45 * b }; },
    approche: (a = .35, c = .5, w = .45) => p => { const b = bell(p, c, w); return { s: 1 + a * b, y: .12 * a * b }; },
    concentre: (c = .45, w = .35) => p => ({ s: 1 - .86 * bell(p, c, w) }),
    incline: (a = 14, c = .5, w = .5) => p => ({ r: a * bell(p, c, w), ht: -a * .25 * bell(p, c + .07, w) }),
    vent: (a = .3) => p => { const e = env(p, .15, .25); return { x: -a * e, r: -12 * e, ht: 7 * e + 3 * sin(p * 42) * e, wl: -14 * e, wr: -14 * e }; },
    cache: (c = .5, w = .4) => p => { const b = bell(p, c, w); return { es: 1 - .82 * b, eg: -.8 * b, s: 1 - .08 * b, ht: 3 * sin(p * 30) * b, y: .06 * b, wl: -20 * b, wr: -20 * b }; },
    fige: (c = .5, w = .42) => p => ({ hold: bell(p, c, w) }),
    recul: () => p => { const a = ss(seg(p, 0, .12)) * (1 - ss(seg(p, .45, 1))); return { s: 1 - .22 * a, y: -.25 * a, wl: 34 * a, wr: 34 * a }; },
    tremble: (a = .02) => p => { const e = env(p, .08, .12); return { x: a * sin(p * 151) * e, y: a * .6 * sin(p * 197 + 1) * e }; },
    kf: (ch, pts, e = 'ss') => { const chs = ch.split(','); return p => { let i = 0; while (i < pts.length - 2 && p > pts[i + 1][0]) i++; const a = pts[i], b = pts[i + 1], v = a[1] + (b[1] - a[1]) * EZ[e](seg(p, a[0], b[0])), o = {}; chs.forEach(c => { o[c] = v; }); return o; }; },
    bat: (n = 3, a = 26, lift = 0) => p => { const e = env(p, .08, .15), v = a * sin(TAU * n * p) * e; return { wl: v, wr: v, y: -lift * e * (1 - .3 * cos(TAU * n * p)) }; },
    alterne: (n = 3, a = 22) => p => { const e = env(p, .08, .15), v = sin(TAU * n * p); return { wl: a * v * e, wr: -a * v * e, r: 4 * v * e }; },
    agite: (side = 1, n = 3, a = 28) => p => { const e = env(p, .12, .2), v = (a * (.6 + .4 * sin(TAU * n * p)) + 8) * e; return side > 0 ? { wr: v, r: -5 * e, ex: .4 * e } : { wl: v, r: 5 * e, ex: -.4 * e }; },
    deploie: (a = 18, sc = 1.3, c = .5, w = .45) => p => { const b = bell(p, c, w); return { wl: a * b, wr: a * b, ws: 1 + (sc - 1) * b, wg: b }; },
    replie: (a = -38, sc = .55, c = .5, w = .45) => p => { const b = bell(p, c, w); return { wl: a * b, wr: a * b, ws: 1 - (1 - sc) * b }; },
    frisson: (a = 7) => p => { const e = env(p, .08, .15); return { wl: a * sin(p * 140) * e, wr: a * sin(p * 140 + 1.3) * e, x: .012 * sin(p * 170) * e }; },
    applaudit: (n = 4) => p => { const e = env(p, .12, .15), v = .5 + .5 * sin(TAU * n * p - PI / 2), w = (52 + 42 * v) * e; return { wl: w, wr: w, ws: 1 + .08 * e }; },
    hausse: () => p => { const b = bell(p, .35, .2), c = bell(p, .42, .3); return { wl: 32 * b, wr: 32 * b, y: -.06 * b, bl: .9 * c, br: .9 * c, ht: 3 * c }; },
    enlace: (c = .5, w = .4) => p => { const b = bell(p, c, w); return { wl: -95 * b, wr: -95 * b, ws: 1 - .12 * b, wf: b > .35 ? 1 : 0, s: 1 - .03 * b }; },
    montre: (side = 1, c = .5, w = .42) => p => { const b = bell(p, c, w), o = { ex: .9 * side * b, ey: .2 * b, r: 6 * side * b, ws: 1 + .12 * b }; if (side > 0) o.wr = 48 * b; else o.wl = 48 * b; return o; },
    evente: (side = 1, n = 6) => p => { const e = env(p, .12, .18), v = 22 * sin(TAU * n * p) * e + 30 * e; return side > 0 ? { wr: v, r: -6 * e } : { wl: v, r: 6 * e }; },
    reverence: () => p => { const b = bell(p, .48, .38); return { sy: 1 - .14 * b, y: .1 * b, wl: -30 * b, wr: -30 * b, hh: -3 * b, ey: .8 * b }; },
    pointe: (a = 6, n = 2) => p => ({ ht: a * sin(TAU * n * p) * env(p, .1, .15) }),
    antenne: (h = 5, n = 3) => p => { const e = env(p, .12, .2); return { hh: h * e * (.6 + .4 * abs(sin(PI * n * p))), ht: 1.6 * sin(TAU * n * 2 * p) * e }; },
    affaisse: (a = 10, c = .5, w = .45) => p => { const b = bell(p, c, w); return { ht: a * b, hh: -5 * b }; },
    dresse: (h = 6, c = .5, w = .45) => p => ({ hh: h * bell(p, c, w) }),
    ebroue: (n = 7) => p => { const e = bell(p, .45, .4), v = sin(TAU * n * p); return { r: 9 * v * e, ht: -8 * v * e, wl: 16 * v * e, wr: -16 * v * e }; },
    hoche: (n = 2) => p => { const e = env(p, .1, .15), v = abs(sin(TAU * n * p)); return { hh: -3.5 * v * e, y: .03 * v * e, ey: .4 * v * e }; },
    nie: (n = 2) => p => { const e = env(p, .1, .15), v = sin(TAU * n * p); return { ht: 7 * v * e, ex: .6 * v * e }; },
    regard: pts => p => { let i = 0; while (i < pts.length - 2 && p > pts[i + 1][0]) i++; const a = pts[i], b = pts[i + 1], f = ss(seg(p, a[0], b[0])); return { ex: a[1] + (b[1] - a[1]) * f, ey: a[2] + (b[2] - a[2]) * f }; },
    suitFollet: (t = 1.2) => p => { const a = TAU * t * p, e = env(p, .12, .15); return { ex: cos(a) * .9 * e, ey: sin(a) * .45 * e, ht: cos(a) * 4 * e }; },
    lueur: (a = 1, c = .5, w = .45) => p => ({ eg: a * bell(p, c, w) }),
    pulse: (n = 2, a = .9) => p => ({ eg: a * pow(sin(PI * n * p), 2) }),
    yeux: (s = 1.25, c = .5, w = .45) => p => ({ es: 1 + (s - 1) * bell(p, c, w) }),
    sourcils: (by = .6, ba = 0, c = .5, w = .45) => p => { const b = bell(p, c, w); return { bl: by * b, br: by * b, ba: ba * b }; },
    sourcil: (side = 1, by = 1, c = .5, w = .45) => p => { const b = bell(p, c, w); return side > 0 ? { br: by * b } : { bl: by * b }; },
    paupiere: (v = .5, c = .5, w = .45) => p => ({ lid: v * bell(p, c, w) }),
    ronde: (n = 2) => p => { const e = env(p, .08, .12), o = { rg: -.45 * e }; for (let i = 0; i < 3; i++) { const q = (((p * n - i / 3) % 1) + 1) % 1; o['r' + (i + 1)] = bell(q, .18, .18) * 1.4 * e; } return o; },
    runes: (n = 2, a = 1) => p => ({ rg: a * pow(sin(PI * n * p), 2) }),
    flash: (at = .3, w = .08) => p => ({ rg: 1.6 * bell(p, at, w) }),
    tourne: (t = 1) => p => ({ rr: 360 * t * io(p) }),
    grandit: (s = 1.7, c = .5, w = .45) => p => { const b = bell(p, c, w); return { rs: 1 + (s - 1) * b, r2: .8 * b }; },
    eteint: (c = .5, w = .42) => p => ({ rg: -1 * bell(p, c, w) }),
    allume: (a = .1, l = .5) => p => { const o = { rg: -1 * (1 - seg(p, a, a + l)) }; for (let i = 0; i < 3; i++) o['r' + (i + 1)] = 1.2 * bell(p, a + l * (i + .5) / 3, l / 5); return o; },
    morse: (code = '..-.-') => p => { const n = code.length, i = min(n - 1, flo(p * n)), f = p * n - i, on = code[i] === '-' ? f < .75 : f < .35; return { rg: on ? .9 : -.6 }; },
    scintille: (n = 6) => p => { const e = env(p, .08, .12), k = flo(p * n * 3), o = { rg: -.35 * e }; o['r' + (1 + (k % 3))] = 1.1 * e * (rnd(k, 2) > .3 ? 1 : .3); return o; },
    voix: () => p => { const e = env(p, .08, .12), v = abs(wav(p * 22, 1)); return { rg: (-.35 + 1.4 * v) * e, eg: .45 * v * e, hh: 2 * v * e }; },
    aura: (a = 1, c = .5, w = .45) => p => ({ ag: a * bell(p, c, w) })
  };
  const K = {
    vers: (k, c = .5, w = .5, g = 0) => (p, b) => { const e = bell(p, c, w); return { col: mix(b, L[k], e), ag: g * e }; },
    tient: (k, g = 0) => (p, b) => { const e = env(p, .15, .22); return { col: mix(b, L[k], e), ag: g * e }; },
    eclat: (k, at = .4, w = .12) => (p, b) => ({ col: mix(b, L[k], bell(p, at, w)) }),
    bat: (k, n = 2) => (p, b) => ({ col: mix(b, L[k], pow(sin(PI * n * p), 2)) }),
    cycle: (ks, n = 1, g = 0) => (p, b) => { const N = ks.length, t = p * n * N, i = flo(t), f = t - i, c = mix(L[ks[i % N]], L[ks[(i + 1) % N]], ss(f)), e = env(p, .1, .2); return { col: mix(b, c, e), ag: g * e }; }
  };
  const F = {
    plumes: (n = 6, at = .2, l = .75) => ({ k: 'plumes', n, at, l }),
    follets: (n = 3, r = 1, t = 1, z = .2) => ({ k: 'follets', n, r, t, z }),
    braises: (n = 5, at = .1, l = .8) => ({ k: 'braises', n, at, l }),
    glyphes: (n = 3, at = .2, l = .65) => ({ k: 'glyphes', n, at, l }),
    octets: (dir = 1, n = 8, at = .1, l = .8) => ({ k: 'octets', dir, n, at, l }),
    ondes: (n = 3, at = .1, l = .8) => ({ k: 'ondes', n, at, l }),
    nuage: (at = .1, l = .8, rain = 0, fixe = 0) => ({ k: 'nuage', at, l, rain, fixe }),
    cercle: (r = 1.05, t = 1, at = .1, l = .8) => ({ k: 'cercle', r, t, at, l }),
    portail: (at = .1, l = .8) => ({ k: 'portail', at, l }),
    losanges: (n = 2, at = .2, l = .6) => ({ k: 'losanges', n, at, l }),
    etincelles: (n = 8, at = .3, l = .4, tip = 0) => ({ k: 'etincelles', n, at, l, tip }),
    lucioles: (n = 6, c1, c2) => ({ k: 'lucioles', n, c1, c2 }),
    icone: (sh, at = .2, l = .6, dx = .78, dy = -.5, z = .2, c = 'c3') => ({ k: 'icone', sh, at, l, dx, dy, z, c }),
    texte: (t, at = .2, l = .6) => ({ k: 'texte', t, at, l }),
    trainee: (n = 3) => ({ k: 'trainee', n }),
    double: (d = .55) => ({ k: 'double', d }),
    converge: (n = 12, at = 0, l = .45) => ({ k: 'converge', n, at, l }),
    vortex: (n = 12, at = .1, l = .8) => ({ k: 'vortex', n, at, l }),
    faisceaux: (at = .15, l = .75) => ({ k: 'faisceaux', at, l }),
    brume: (n = 5, at = .1, l = .8) => ({ k: 'brume', n, at, l }),
    pages: (n = 3, at = .1, l = .7) => ({ k: 'pages', n, at, l }),
    points: (at = .1, l = .8) => ({ k: 'points', at, l }),
    tient: (sh, dx = 0, dy = 1, z = .35, at = .1, l = .8, c = 'c3', fixe = 0) => ({ k: 'tient', sh, dx, dy, z, at, l, c, fixe }),
    eclabousse: (n = 10, at = .45, l = .4) => ({ k: 'eclabousse', n, at, l }),
    lance: (sh = 'rune', at = .4, l = .45) => ({ k: 'lance', sh, at, l })
  };
  const E = (...a) => { if (a.length === 1) return a[0]; const o = [[0, a[0]]]; for (let i = 1; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; };

  /* ---------- 156 animations, 12 familles de 13 ---------- */
  const LIST = [], BY = {};
  function A(fam, id, n, d, w, t, e, c, x) { const o = { fam, id, n, d: min(2.8, d), w, t: t || [], e: e || 'open', c: c || null, x: x || [], trail: 0, num: LIST.length + 1 }; o.x.forEach(f => { if (f.k === 'trainee') o.trail = f.n; }); LIST.push(o); BY[id] = o; }
  function X(id, d, t, e, c, x, hard) { const o = { fam: 'extra', id, n: id, d, w: '', t: t || [], e: e || 'open', c: c || null, x: x || [], trail: 0, hard: !!hard, num: 0 }; BY[id] = o; }
  const m = M, k = K, f = F;

  A('apparition', 'materialise', 'Matérialisation', 2.2, 'Passage en mode en ligne', [m.forme(.5), m.allume(.52, .34), m.kf('wl,wr', [[0, 0], [.2, -42], [.55, -42], [.82, 8], [1, 0]]), m.kf('ws', [[0, 1], [.2, .5], [.55, .5], [.82, 1.08], [1, 1]])], E('open', .1, 'closed', .72, 'wide', .9, 'open'), k.vers('cy', .62, .3, .9), [f.converge(14, .12, .38), f.losanges(1, .58, .4)]);
  A('apparition', 'evapore', 'Évaporation', 2.2, 'Retour au mode hors ligne', [m.kf('wl,wr', [[0, 0], [.18, -40], [.8, -40], [1, 0]]), m.dissout(.5, .32), m.kf('rg', [[0, 0], [.2, -1], [.8, -1], [1, 0]])], E('open', .15, 'closed', .85, 'open'), k.vers('c8', .5, .4), [f.braises(8, .25, .55)]);
  A('apparition', 'noir', 'Dans le noir', 2.4, 'Écran presque éteint : seuls ses yeux restent', [m.noir(.5, .4), m.lueur(.8, .5, .4), m.regard([[0, 0, 0], [.35, -.7, 0], [.55, .7, 0], [.75, 0, 0], [1, 0, 0]])], E('open', .4, 'closed', .46, 'open', .6, 'closed', .65, 'open'));
  A('apparition', 'portail', 'Portail', 2.4, 'Changement d’application', [m.portail()], E('open', .2, 'closed', .6, 'wide', .85, 'open'), k.vers('cy', .45, .3, .5), [f.portail(.05, .9)]);
  A('apparition', 'hologramme', 'Hologramme', 1.8, 'Connexion instable', [m.glitch(7), m.fantome(3, .5)], E('scan', .85, 'open'), k.eclat('cy', .3, .25), [f.etincelles(6, .3, .3)]);
  A('apparition', 'double', 'Dédoublement', 2.2, 'Deux recherches à la fois', [m.flot(.04, 2), m.lueur(.6)], E('open', .3, 'wide', .7, 'open'), null, [f.double(.62)]);
  A('apparition', 'brume', 'Brume', 2.6, 'Il se dissipe en brume, puis revient', [m.kf('op', [[0, 1], [.3, .15], [.62, .15], [1, 1]]), m.kf('x', [[0, 0], [.3, -.25], [.62, .25], [1, 0]]), m.kf('sx', [[0, 1], [.3, 1.25], [.62, 1.25], [1, 1]])], 'open', k.vers('c3', .45, .35), [f.brume(6, .05, .9)]);
  A('apparition', 'rideau', 'Descente du bord', 2.4, 'Ouverture de MiMai en ligne', [m.rideau()], E('open', .4, 'happy', .85, 'open'), null, [f.plumes(3, .45, .5)]);
  A('apparition', 'plongeon', 'Plongeon au loin', 2.4, 'Recherche très lointaine', [m.plongeon(.28), m.bat(4, 14)], E('small', .75, 'open'), k.vers('in', .45, .4));
  A('apparition', 'etincelle', 'Étincelle', 1.8, 'Arrivée discrète', [m.concentre(.42, .3), m.aura(1.2, .42, .3)], E('point', .7, 'wide', .9, 'open'), k.vers('wh', .42, .3, 1), [f.etincelles(8, .55, .35)]);
  A('apparition', 'ombre', 'Ombre', 2.4, 'Mode sombre activé', [m.kf('hc', [[0, 0], [.25, -.9], [.75, -.9], [1, 0]]), m.kf('rg', [[0, 0], [.25, .8], [.75, .8], [1, 0]]), m.lueur(.7)], 'open', k.tient('cy', .4));
  A('apparition', 'sillage', 'Sillage', 2.2, 'Il file vers une autre appli', [m.chemin([[.9, -.1], [.9, -.1]], 18)], 'open', null, [f.trainee(3)]);
  A('apparition', 'invisible', 'Invisible', 2.4, 'Navigation privée', [m.kf('op', [[0, 1], [.25, .18], [.78, .18], [1, 1]]), m.flot(.03, 2)], E('open', .25, 'point', .78, 'open'), k.tient('c3'), [f.icone('cadenas', .3, .5)]);

  A('vol', 'plane', 'Plané', 2.4, 'Il traverse l’écran', [m.chemin([[.7, -.15], [.2, -.25], [-.6, -.1]], 16), m.kf('wl,wr', [[0, 0], [.15, 16], [.85, 16], [1, 0]])], 'open', null, [f.trainee(2)]);
  A('vol', 'pique', 'Piqué', 1.8, 'Une réponse arrive vite', [m.chemin([[-.4, -.5], [.15, .55], [.55, -.1]], 20), m.kf('wl,wr', [[0, 0], [.3, 30], [.5, -30], [.75, 10], [1, 0]])], E('open', .3, 'wide', .7, 'open'), null, [f.trainee(3)]);
  A('vol', 'looping', 'Looping', 1.9, 'Double toucher', [m.boucle(.55), m.bat(2, 18)], E('wide', .8, 'happy'), k.eclat('cy', .5, .2), [f.trainee(3)]);
  A('vol', 'spirale', 'Spirale', 2.6, 'Il monte chercher l’info', [m.spirale(.4, 2, .6), m.regard([[0, 0, 0], [.2, 0, -.8], [.8, 0, -.8], [1, 0, 0]])], 'open', null, [f.trainee(2)]);
  A('vol', 'zigzag', 'Zigzag', 1.8, 'Il évite une pub qui surgit', [m.chemin([[.35, -.2], [-.3, -.35], [.35, -.5], [-.15, -.25]], 22, 'lin')], E('open', .2, 'wide', .8, 'open'));
  A('vol', 'surplace', 'Vol stationnaire', 2.0, 'On lâche le téléphone : il reste en l’air', [m.bat(9, 22, .12), m.tremble(.012)], 'wide');
  A('vol', 'ascension', 'Ascension', 2.4, 'Grande nouvelle', [m.kf('y', [[0, 0], [.15, -.15], [.3, -.35], [.45, -.6], [.8, -.6], [1, 0]]), m.bat(4, 30)], E('open', .45, 'happy', .85, 'open'), k.vers('c3', .55, .35, .6), [f.plumes(4, .2, .6)]);
  A('vol', 'atterrissage', 'Atterrissage en douceur', 2.0, 'Il se pose sans rebondir', [m.kf('y', [[0, 0], [.2, -.7], [.75, 0], [1, 0]], 'sn'), m.kf('wl,wr', [[0, 0], [.2, 26], [.6, 34], [.8, -10], [1, 0]]), m.kf('ws', [[0, 1], [.2, 1.15], [.7, 1.2], [1, 1]])], E('open', .7, 'happy', .9, 'open'), null, [f.brume(3, .65, .3)]);
  A('vol', 'rasemottes', 'Rase-mottes', 2.2, 'Il parcourt une longue page', [m.chemin([[.3, .45], [-.5, .5], [-.2, .2]], 14), m.kf('wl,wr', [[0, 0], [.2, -24], [.8, -24], [1, 0]]), m.regard([[0, 0, 0], [.2, 0, .8], [.8, 0, .8], [1, 0, 0]])], 'open');
  A('vol', 'virage', 'Virage', 2.0, 'Il change de direction', [m.chemin([[.6, -.2], [.7, .25], [.1, .2]], 26), m.kf('wl', [[0, 0], [.3, 30], [.6, -10], [1, 0]]), m.kf('wr', [[0, 0], [.3, -10], [.6, 30], [1, 0]])], 'open', null, [f.trainee(2)]);
  A('vol', 'courant', 'Courant d’air', 2.8, 'Il se laisse porter', [m.kf('x', [[0, 0], [.5, .4], [1, 0]], 'sn'), m.vague(.12, 2), m.kf('wl,wr', [[0, 0], [.15, 20], [.85, 20], [1, 0]]), m.kf('ws', [[0, 1], [.2, 1.18], [.8, 1.18], [1, 1]])], E('open', .3, 'croissant', .8, 'open'), null, [f.brume(4, .1, .8)]);
  A('vol', 'retour', 'Retour au nid', 2.6, 'Il revient avec la réponse', [m.kf('x', [[0, 0], [.3, 1.8], [.45, 1.8], [1, 0]], 'sn'), m.kf('y', [[0, 0], [.3, -.3], [.45, -.3], [1, 0]]), m.bat(5, 22)], E('open', .5, 'happy', .9, 'open'), null, [f.tient('page', .25, .55, .3, .45, .5, 'c1')]);
  A('vol', 'papillon', 'Papillon', 2.4, 'Il papillonne de joie', [m.erre(.35, .2, 1), m.bat(10, 20)], 'happy', k.cycle(['c4', 'cy', 'aq'], 1), [f.lucioles(3)]);

  A('ailes', 'coucou', 'Coucou de l’aile', 1.8, 'Il vous dit bonjour', [m.agite(1, 3, 30), m.flot(.03, 1)], E('open', .2, 'happy', .85, 'open'));
  A('ailes', 'bravo', 'Bravo', 1.8, 'Vous avez réussi', [m.applaudit(4), m.monte(.12)], 'happy', k.eclat('c2', .5, .3), [f.plumes(4, .3, .6)]);
  A('ailes', 'calin', 'Câlin', 2.2, 'Vous dites merci', [m.enlace(.5, .38)], E('open', .2, 'croissant', .85, 'open'), k.vers('c3', .5, .4, .5), [f.icone('coeur', .4, .45, 0, -.75, .25, 'c3')]);
  A('ailes', 'etirement', 'Étirement', 2.2, 'Il se réveille', [m.deploie(26, 1.4, .45, .35), m.kf('hh', [[0, 0], [.45, 6], [.7, 0], [1, 0]])], E('closed', .78, 'open'), null, [f.plumes(2, .5, .45)]);
  A('ailes', 'frisson', 'Frisson', 1.6, 'Il a froid', [m.frisson(8), m.kf('s', [[0, 1], [.2, .95], [.8, .95], [1, 1]])], 'small', k.vers('gl', .5, .45));
  A('ailes', 'abri', 'Abri d’ailes', 2.2, 'Averse annoncée : il s’abrite', [m.kf('wl,wr', [[0, 0], [.25, -100], [.75, -100], [1, 0]]), m.kf('wf', [[0, 0], [.15, 0], [.16, 1], [.84, 1], [.85, 0], [1, 0]], 'lin')], E('open', .25, 'closed', .78, 'open'), null, [f.nuage(.1, .8, 1)]);
  A('ailes', 'haussement', 'Haussement d’ailes', 1.6, 'Il ne sait pas', [m.hausse(), m.incline(8, .45, .3)], E('open', .25, 'small', .65, 'open'), null, [f.texte('?', .35, .5)]);
  A('ailes', 'par_ici', 'Par ici', 2.0, 'Il montre une notification', [m.montre(1, .5, .4), m.va(.15, 0, .5, .4)], 'open');
  A('ailes', 'eventail', 'Éventail', 2.2, 'Il fait chaud', [m.evente(-1, 7), m.incline(-6), m.paupiere(.4, .5, .45)], 'open', k.vers('c2', .5, .45));
  A('ailes', 'reverence', 'Révérence ailée', 2.0, 'Premier lancement en ligne', [m.reverence()], E('open', .3, 'closed', .7, 'open'), k.vers('c3', .5, .4, .4), [f.plumes(3, .4, .5)]);
  A('ailes', 'plumes_vent', 'Plumes au vent', 2.2, 'Il secoue ses ailes', [m.kf('wl', [[0, 0], [.2, 25], [.3, -10], [.4, 25], [.5, -10], [.6, 25], [1, 0]]), m.kf('wr', [[0, 0], [.25, 25], [.35, -10], [.45, 25], [.55, -10], [.65, 25], [1, 0]])], E('closed', .7, 'open'), null, [f.plumes(8, .2, .7)]);
  A('ailes', 'chef', 'Chef d’orchestre', 2.6, 'Musique en streaming', [m.kf('wl', [[0, 0], [.12, 30], [.25, -5], [.37, 30], [.5, -5], [.62, 30], [.75, -5], [.87, 30], [1, 0]]), m.kf('wr', [[0, 0], [.18, -5], [.31, 30], [.43, -5], [.56, 30], [.68, -5], [.81, 30], [1, 0]]), m.pointe(5, 4)], 'happy', null, [f.ondes(3, .1, .8)]);
  A('ailes', 'repliees', 'Ailes repliées', 2.0, 'Mode discret', [m.replie(-40, .5, .5, .4), m.kf('s', [[0, 1], [.3, .9], [.7, .9], [1, 1]])], E('open', .3, 'small', .7, 'open'), k.vers('c7', .5, .4));

  A('capuche', 'antenne', 'Antenne', 2.4, 'Recherche de réseau', [m.antenne(7, 3), m.regard([[0, 0, 0], [.2, 0, -.9], [.8, 0, -.9], [1, 0, 0]])], 'open', k.bat('cy', 2), [f.ondes(3, .15, .7)]);
  A('capuche', 'pointe_dressee', 'Pointe dressée', 1.8, 'Il entend son nom', [m.dresse(8, .5, .42), m.incline(-10, .5, .4), m.sourcils(.7)], E('open', .2, 'wide', .75, 'open'));
  A('capuche', 'tombante', 'Capuche tombante', 2.4, 'Batterie faible', [m.affaisse(12, .5, .45), m.coule(.12), m.paupiere(.45, .5, .45)], 'open', k.vers('c8', .5, .45));
  A('capuche', 'girouette', 'Girouette', 2.4, 'Il indique le vent', [m.kf('ht', [[0, 0], [.2, 10], [.4, -10], [.6, 8], [.8, -4], [1, 0]]), m.kf('r', [[0, 0], [.2, -6], [.4, 6], [.6, -4], [1, 0]])], 'open');
  A('capuche', 'ebroue', 'S’ébroue', 1.8, 'Après la pluie', [m.ebroue(7)], E('closed', .8, 'open'), null, [f.eclabousse(12, .25, .5)]);
  A('capuche', 'cachette', 'Cachette', 1.8, 'On secoue le téléphone', [m.cache(.5, .4), m.kf('pr', [[0, 0], [.2, 6], [.4, -6], [.6, 4], [1, 0]])], 'open');
  A('capuche', 'capuche_vent', 'Capuche au vent', 2.4, 'Grand vent annoncé', [m.vent(.3), m.frisson(4), m.paupiere(.4, .5, .45)], 'open', null, [f.plumes(2, .3, .6)]);
  A('capuche', 'oui', 'Oui de la pointe', 1.4, 'Il est d’accord', [m.hoche(2)], E('open', .3, 'croissant', .85, 'open'));
  A('capuche', 'non', 'Non de la pointe', 1.5, 'Il refuse un site douteux', [m.nie(2), m.sourcils(0, .7)], 'open');
  A('capuche', 'lanterne', 'Lanterne', 2.6, 'Suspendu par la pointe', [m.lanterne(16, 2)], E('open', .5, 'croissant', .9, 'open'), k.bat('c3', 2));
  A('capuche', 'bonnet', 'Bonnet de nuit', 2.6, 'Il est tard', [m.kf('ht', [[0, 0], [.3, 13], [.85, 13], [1, 0]]), m.kf('hh', [[0, 0], [.3, -8], [.85, -8], [1, 0]]), m.paupiere(.6, .55, .4)], E('open', .5, 'closed', .9, 'open'), k.vers('c8', .55, .4), [f.texte('z', .45, .45)]);
  A('capuche', 'pointe_electrique', 'Pointe électrique', 1.6, 'Il se recharge', [m.dresse(5, .4, .3), m.tremble(.01)], 'wide', k.eclat('wh', .35, .1), [f.etincelles(8, .25, .45, 1)]);
  A('capuche', 'chapeau', 'Coup de chapeau', 1.8, 'Merci beaucoup', [m.kf('ht', [[0, 0], [.3, -6], [.5, 8], [.7, 0], [1, 0]]), m.kf('hh', [[0, 0], [.35, -6], [.6, 0], [1, 0]]), m.kf('y', [[0, 0], [.4, .06], [.7, 0], [1, 0]])], E('open', .3, 'happy', .8, 'open'));

  A('regard', 'scrute', 'Scrute la page', 2.4, 'Analyse d’une page web', [m.regard([[0, 0, 0], [.15, -.9, 0], [.35, .9, 0], [.55, -.9, .3], [.75, .9, .3], [1, 0, 0]])], E('open', .1, 'scan', .9, 'open'), k.tient('cy', .3));
  A('regard', 'sourire', 'Sourire des yeux', 1.6, 'Il est content', [m.lueur(.6), m.flot(.03, 1)], E('open', .2, 'croissant', .85, 'open'));
  A('regard', 'clin', 'Clin d’œil', 1.3, 'Complicité', [m.pointe(4, 1), m.incline(6, .5, .4)], E('open', .3, 'clin', .72, 'open'));
  A('regard', 'ecarquille', 'Yeux écarquillés', 1.6, 'Info surprenante', [m.yeux(1.3, .4, .3), m.lueur(1.2, .4, .25), m.sourcils(1.1, 0, .45, .35), m.recul()], E('open', .15, 'wide', .8, 'open'), null, [f.texte('!', .25, .5)]);
  A('regard', 'en_coin', 'Regard en coin', 2.2, 'Il soupçonne une arnaque', [m.regard([[0, 0, 0], [.2, .9, .1], [.8, .9, .1], [1, 0, 0]]), m.paupiere(.45, .5, .45), m.sourcils(0, .8, .5, .45)], 'open');
  A('regard', 'ebloui', 'Ébloui', 1.8, 'Écran trop lumineux', [m.paupiere(.75, .5, .4), m.incline(-8)], 'open', k.vers('wh', .5, .4, .8));
  A('regard', 'pensif', 'Pensif', 2.6, 'Il prépare une réponse', [m.regard([[0, 0, 0], [.3, -.6, -.8], [.7, .3, -.9], [1, 0, 0]]), m.pointe(3, 1)], 'open', k.bat('in', 1));
  A('regard', 'defilement', 'Suit le défilement', 2.4, 'Vous faites défiler', [m.regard([[0, 0, 0], [.06, 0, -.7], [.25, 0, .8], [.27, 0, -.7], [.5, 0, .8], [.52, 0, -.7], [.75, 0, .8], [1, 0, 0]])], 'open');
  A('regard', 'phares', 'Phares', 2.4, 'Lampe de poche', [m.lueur(1.4, .5, .45), m.regard([[0, 0, 0], [.2, 0, .6], [.8, 0, .6], [1, 0, 0]])], 'wide', k.tient('wh', .5), [f.faisceaux(.15, .75)]);
  A('regard', 'chargement', 'Chargement', 2.4, 'Une page charge', [m.ronde(3), m.flot(.03, 2)], E('open', .15, 'anneau', .85, 'open'));
  A('regard', 'yeux_coeur', 'Yeux en cœur', 2.0, 'Coup de cœur', [m.pulse(3, .8), m.monte(.1)], E('open', .15, 'coeur', .85, 'open'), k.vers('c3', .5, .45, .4), [f.braises(4, .2, .7)]);
  A('regard', 'runiques', 'Yeux runiques', 2.0, 'Formule secrète', [m.runes(2, 1), m.lueur(.8)], E('open', .2, 'losange', .8, 'open'), k.vers('cy', .5, .4, .6), [f.glyphes(3, .3, .5)]);
  A('regard', 'cils', 'Battements de cils', 1.6, 'Il fait son charmeur', [m.incline(-8, .5, .45), m.lueur(.5)], E('open', .2, 'closed', .27, 'open', .34, 'closed', .41, 'open', .48, 'closed', .55, 'open'));

  A('runes', 'allumage', 'Allumage', 2.0, 'Démarrage du mode en ligne', [m.allume(.1, .6), m.lueur(.5, .75, .2)], E('closed', .7, 'open'), null, [f.losanges(1, .7, .3)]);
  A('runes', 'ronde_runes', 'Ronde des runes', 2.4, 'Il réfléchit en ligne', [m.ronde(3), m.regard([[0, 0, 0], [.2, -.5, -.6], [.8, -.5, -.6], [1, 0, 0]])], 'open');
  A('runes', 'flash', 'Flash runique', 1.4, 'Alerte importante', [m.flash(.25, .08), m.flash(.55, .08)], E('open', .2, 'wide', .7, 'open'), k.eclat('wh', .25, .1), [f.losanges(2, .2, .5)]);
  A('runes', 'rune_tourne', 'Rune tournante', 2.2, 'Mise à jour d’une appli', [m.tourne(2), m.kf('r2', [[0, 0], [.15, .8], [.85, .8], [1, 0]])], 'open');
  A('runes', 'code', 'Code secret', 2.4, 'Saisie d’un mot de passe', [m.morse('.-..-.'), m.regard([[0, 0, 0], [.15, 0, .6], [.85, 0, .6], [1, 0, 0]])], 'open');
  A('runes', 'mode_avion', 'Mode avion', 2.4, 'Il coupe les ondes', [m.kf('r1', [[0, 0], [.2, -1.2], [.85, -1.2], [1, 0]]), m.kf('r2', [[0, 0], [.3, -1.2], [.85, -1.2], [1, 0]]), m.kf('r3', [[0, 0], [.4, -1.2], [.85, -1.2], [1, 0]]), m.replie(-20, .8, .55, .35)], E('open', .4, 'small', .85, 'open'), k.vers('c8', .55, .35));
  A('runes', 'aurore', 'Runes d’aurore', 2.6, 'Nouveau thème', [m.runes(2, .8)], 'open', k.cycle(['cy', 'aq', 'in', 'vi'], 1, .5));
  A('runes', 'grande_rune', 'Grande rune', 2.2, 'Information essentielle', [m.grandit(1.9, .5, .4), m.regard([[0, 0, 0], [.3, 0, -1], [.7, 0, -1], [1, 0, 0]])], 'open', k.vers('cy', .5, .4, .5));
  A('runes', 'envolees', 'Runes envolées', 2.2, 'Envoi d’un message', [m.kf('rg', [[0, 0], [.2, 1], [.4, -1], [.85, -1], [1, 0]]), m.dresse(4)], E('open', .5, 'happy', .85, 'open'), null, [f.glyphes(3, .25, .6)]);
  A('runes', 'dechiffre', 'Déchiffre', 2.4, 'Traduction en ligne', [m.scintille(9), m.regard([[0, 0, 0], [.15, -.8, 0], [.35, .8, 0], [.55, -.8, 0], [.75, .8, 0], [1, 0, 0]])], E('open', .1, 'scan', .9, 'open'));
  A('runes', 'sceau', 'Sceau', 2.4, 'Paiement sécurisé validé', [m.runes(1, .9), m.monte(.08)], E('open', .7, 'croissant', .92, 'open'), k.tient('cy', .4), [f.cercle(1.05, 1, .05, .85), f.icone('coche', .55, .4, .75, -.5, .24, 'aq')]);
  A('runes', 'pouls', 'Pouls runique', 2.2, 'Il écoute votre voix', [m.voix(), m.dresse(3)], 'open', k.tient('cy', .2));
  A('runes', 'balise', 'Balise', 2.4, 'Localisation partagée', [m.runes(3, .8)], 'open', null, [f.losanges(3, .1, .8)]);

  A('reseau', 'connexion', 'Connexion', 2.2, 'Réseau trouvé', [m.antenne(6, 2), m.kf('rg', [[0, 0], [.1, -.6], [.5, -.6], [.6, 1], [1, 0]])], E('open', .55, 'wide', .8, 'open'), k.eclat('cy', .6, .15), [f.ondes(3, .05, .55), f.icone('coche', .6, .35, .75, -.5, .22, 'aq')]);
  A('reseau', 'recherche_web', 'Recherche web', 2.6, 'Il cherche sur Internet', [m.chemin([[-.35, -.05], [.35, -.05]], 10), m.regard([[0, 0, 0], [.25, -.8, .2], [.5, .8, .2], [.75, -.8, .2], [1, 0, 0]])], 'open', k.tient('cy', .2), [f.tient('loupe', .55, .3, .32, .05, .9, 'c2')]);
  A('reseau', 'telechargement', 'Téléchargement', 2.6, 'Un fichier arrive', [m.antenne(4, 2), m.lueur(.4)], 'open', null, [f.octets(1, 10, .05, .85)]);
  A('reseau', 'envoi', 'Envoi', 2.2, 'Il envoie un fichier', [m.kf('y', [[0, 0], [.3, .08], [.5, -.1], [1, 0]]), m.bat(2, 24)], E('open', .45, 'happy', .85, 'open'), null, [f.octets(-1, 10, .3, .65)]);
  A('reseau', 'synchro', 'Synchronisation', 2.6, 'Vos données se mettent à jour', [m.tourne(1), m.flot(.03, 2)], 'open', k.bat('cy', 2), [f.nuage(.05, .9, 0)]);
  A('reseau', 'streaming', 'Streaming', 2.6, 'Vidéo ou musique en ligne', [m.flot(.02, 3), m.runes(4, .5)], E('open', .3, 'croissant', .8, 'open'), null, [f.octets(1, 14, 0, 1)]);
  A('reseau', 'lent', 'Réseau lent', 2.8, 'La connexion rame', [m.kf('y', [[0, 0], [.5, .08], [1, 0]], 'sn'), m.paupiere(.5, .5, .45), m.kf('wl,wr', [[0, 0], [.5, -12], [1, 0]], 'sn'), m.runes(1, .4)], 'open', k.vers('c7', .5, .45), [f.points(.1, .85)]);
  A('reseau', 'perdue', 'Connexion perdue', 2.4, 'Plus de réseau', [m.affaisse(9, .55, .4), m.sourcils(.4, -.9, .55, .4), m.coule(.1, .55, .4), m.kf('rg', [[0, 0], [.3, -1], [.8, -1], [1, 0]])], 'open', k.vers('c8', .55, .4), [f.ondes(2, .05, .35), f.icone('croix', .4, .45, .75, -.55, .2, 'c3')]);
  A('reseau', 'retrouvee', 'Connexion retrouvée', 2.0, 'Le réseau revient', [m.deploie(22, 1.25, .5, .35), m.monte(.18, .5, .35), m.flash(.45, .1)], E('open', .35, 'happy', .85, 'open'), k.eclat('cy', .45, .2), [f.ondes(3, .3, .6)]);
  A('reseau', 'tour_du_monde', 'Tour du monde', 2.8, 'Résultats du monde entier', [m.chemin([[.65, .1], [0, .32], [-.65, .1], [0, -.18]], 12)], 'open', null, [f.tient('globe', 0, .05, .5, .05, .9, 'c3', 1)]);
  A('reseau', 'meteo', 'Météo en direct', 2.4, 'Il annonce la pluie de demain', [m.kf('y', [[0, 0], [.3, .1], [.8, .1], [1, 0]]), m.regard([[0, 0, 0], [.25, 0, -1], [.8, 0, -1], [1, 0, 0]])], 'open', null, [f.nuage(.1, .85, 1)]);
  A('reseau', 'actualites', 'Actualités', 2.4, 'Les nouvelles du jour', [m.regard([[0, 0, 0], [.35, .7, .3], [.8, .7, .3], [1, 0, 0]]), m.incline(6, .55, .4)], 'open', null, [f.pages(3, .1, .65)]);
  A('reseau', 'sauvegarde', 'Sauvegarde en ligne', 2.6, 'Vos photos sont sauvegardées', [m.kf('y', [[0, 0], [.35, -.75], [.55, -.75], [1, 0]], 'sn'), m.bat(4, 20)], E('open', .6, 'happy', .9, 'open'), null, [f.nuage(.15, .5, 0, 1), f.icone('coche', .6, .35, .75, -.5, .22, 'aq')]);

  A('messages', 'message', 'Nouveau message', 2.0, 'Un message arrive', [m.kf('x', [[0, 0], [.2, .5], [.5, 0], [1, 0]], 'sn'), m.bat(3, 20)], E('open', .45, 'wide', .7, 'open'), null, [f.tient('lettre', .1, .55, .32, .15, .75, 'c1')]);
  A('messages', 'appel', 'Appel vidéo', 2.4, 'Quelqu’un vous appelle', [m.frisson(5), m.lueur(.8, .5, .45), m.dresse(4)], 'wide', k.bat('aq', 4), [f.losanges(3, .05, .85)]);
  A('messages', 'mention', 'Mention', 1.8, 'On parle de vous', [m.incline(-12, .5, .42), m.sourcils(.6)], E('open', .3, 'clin', .7, 'open'), null, [f.texte('@', .2, .6)]);
  A('messages', 'clochette', 'Clochette', 2.0, 'Un rappel sonne', [m.pointe(9, 5), m.lanterne(6, 3)], 'wide', null, [f.ondes(2, .1, .7)]);
  A('messages', 'urgent', 'Urgent', 1.6, 'Une alerte à lire tout de suite', [m.flash(.2, .08), m.flash(.5, .08), m.frisson(6), m.dresse(6)], 'wide', k.eclat('wh', .2, .1), [f.texte('!', .15, .6)]);
  A('messages', 'lu', 'Message lu', 1.4, 'Votre message a été lu', [m.hoche(1)], E('open', .3, 'croissant', .8, 'open'), null, [f.icone('coche', .2, .5, .7, -.5, .2, 'aq'), f.icone('coche', .32, .45, .86, -.5, .2, 'aq')]);
  A('messages', 'ecrit', 'Quelqu’un écrit', 2.6, 'Réponse en cours de frappe', [m.regard([[0, 0, 0], [.15, .8, -.3], [.85, .8, -.3], [1, 0, 0]]), m.flot(.02, 2)], 'open', null, [f.points(.05, .9)]);
  A('messages', 'vocal', 'Message vocal', 2.4, 'Un message audio arrive', [m.voix(), m.antenne(3, 4)], 'open', null, [f.ondes(3, .1, .8)]);
  A('messages', 'livraison', 'Livraison', 2.4, 'Votre colis arrive', [m.kf('y', [[0, 0], [.25, -.4], [.6, .05], [1, 0]], 'sn'), m.bat(4, 18)], E('open', .6, 'happy', .9, 'open'), null, [f.tient('octet', 0, .62, .32, .3, .55, 'c2')]);
  A('messages', 'invitation', 'Invitation', 2.4, 'Un événement partagé', [m.reverence()], E('open', .3, 'closed', .7, 'open'), null, [f.tient('lettre', .72, .1, .3, .1, .8, 'c1')]);
  A('messages', 'partage', 'Partage', 2.0, 'Il transmet une info à un ami', [m.kf('r', [[0, 0], [.3, -10], [.45, 12], [1, 0]]), m.kf('wr', [[0, 0], [.3, -20], [.45, 45], [.7, 0], [1, 0]])], E('open', .45, 'happy', .8, 'open'), null, [f.lance('rune', .45, .45)]);
  A('messages', 'pause', 'Notifications en pause', 2.4, 'Mode concentration', [m.replie(-30, .7, .5, .4), m.affaisse(6, .5, .4), m.eteint(.5, .4)], E('open', .3, 'closed', .75, 'open'), k.vers('c8', .5, .4));
  A('messages', 'resume', 'Résumé du jour', 2.6, 'Le point du soir', [m.flot(.03, 2), m.regard([[0, 0, 0], [.3, .6, .4], [.8, .6, .4], [1, 0, 0]])], E('open', .7, 'croissant', .92, 'open'), null, [f.pages(3, .05, .6), f.icone('coche', .7, .25, .78, -.5, .2, 'aq')]);

  A('garde', 'sentinelle', 'Sentinelle', 2.8, 'Il surveille le téléphone', [m.regard([[0, 0, 0], [.2, -.9, 0], [.45, -.9, 0], [.6, .9, 0], [.85, .9, 0], [1, 0, 0]]), m.dresse(4), m.kf('r', [[0, 0], [.2, -5], [.45, -5], [.6, 5], [.85, 5], [1, 0]])], 'open');
  A('garde', 'protection', 'Protection', 2.2, 'Site dangereux bloqué', [m.approche(.15, .45, .35), m.sourcils(0, 1, .5, .4), m.dresse(5)], 'open', k.tient('cy', .5), [f.tient('bouclier', 0, .12, .95, .15, .7, 'cy')]);
  A('garde', 'alerte', 'Alerte', 1.8, 'Danger détecté', [m.dresse(9, .4, .35), m.deploie(26, 1.2, .4, .35), m.flash(.3, .1)], E('open', .15, 'wide', .8, 'open'), k.eclat('wh', .3, .12), [f.losanges(2, .25, .5)]);
  A('garde', 'patrouille', 'Patrouille', 2.8, 'Il fait sa ronde', [m.chemin([[-.45, 0], [-.45, 0], [.45, 0], [.45, 0]], 10), m.regard([[0, 0, 0], [.2, -.9, 0], [.4, -.9, .2], [.6, .9, 0], [.8, .9, .2], [1, 0, 0]])], 'open');
  A('garde', 'verrou', 'Verrouillage', 2.2, 'Vos données sont protégées', [m.kf('s', [[0, 1], [.3, .95], [.7, .95], [1, 1]]), m.runes(1, 1)], 'open', k.tient('cy', .4), [f.cercle(.8, -1.5, .05, .7), f.icone('cadenas', .35, .5, .75, -.5, .24, 'c2')]);
  A('garde', 'mot_de_passe', 'Mot de passe fort', 2.4, 'Il approuve votre mot de passe', [m.morse('-.-.--'), m.hoche(1)], E('open', .7, 'croissant', .92, 'open'), null, [f.icone('coche', .72, .25, .75, -.5, .22, 'aq')]);
  A('garde', 'intrus', 'Intrus repoussé', 1.8, 'Spam bloqué', [m.kf('s', [[0, 1], [.25, 1.25], [.45, 1], [1, 1]]), m.kf('y', [[0, 0], [.25, .06], [.45, 0], [1, 0]]), m.deploie(30, 1.2, .3, .2), m.sourcils(0, 1, .35, .3)], 'open', k.eclat('wh', .27, .1), [f.etincelles(10, .22, .35)]);
  A('garde', 'bouclier_total', 'Bouclier total', 2.6, 'Mode sécurité maximum', [m.aura(1, .5, .45), m.monte(.06), m.runes(2, 1)], 'open', k.tient('cy', .7), [f.cercle(1.15, 1, .05, .9), f.losanges(1, .4, .5)]);
  A('garde', 'aux_aguets', 'Aux aguets', 2.4, 'Bruit suspect', [m.fige(.5, .42), m.dresse(8, .5, .4), m.yeux(1.15, .5, .4), m.regard([[0, 0, 0], [.15, .9, 0], [.5, .9, 0], [.6, -.9, 0], [.85, -.9, 0], [1, 0, 0]])], 'open');
  A('garde', 'confiance', 'Site de confiance', 1.8, 'Ce site est sûr', [m.hoche(1), m.lueur(.5)], E('open', .3, 'croissant', .85, 'open'), k.eclat('aq', .4, .25), [f.icone('coche', .25, .55, .75, -.5, .22, 'aq')]);
  A('garde', 'garde_nuit', 'Garde de nuit', 2.8, 'Il veille pendant votre sommeil', [m.regard([[0, 0, 0], [.3, -.6, .2], [.6, .6, .2], [1, 0, 0]]), m.kf('rg', [[0, 0], [.2, -.7], [.8, -.7], [1, 0]])], E('open', .15, 'point', .9, 'open'), k.tient('c7'), [f.lucioles(3)]);
  A('garde', 'escorte', 'Escorte', 2.4, 'Il vous guide dans une appli', [m.chemin([[.35, .05], [.45, .05]], 10), m.montre(1, .55, .3)], 'open');
  A('garde', 'serment', 'Serment', 2.4, 'Vos données restent privées', [m.kf('wl', [[0, 0], [.25, -95], [.75, -95], [1, 0]]), m.kf('wf', [[0, 0], [.15, 0], [.16, 1], [.84, 1], [.85, 0], [1, 0]], 'lin'), m.runes(1, .9)], E('open', .3, 'closed', .75, 'open'), k.tient('cy', .4));

  A('humeurs', 'joie', 'Joie', 2.0, 'Une bonne nouvelle', [m.bat(6, 28, .18), m.monte(.15)], 'croissant', k.vers('c3', .5, .45, .5), [f.plumes(6, .25, .65)]);
  A('humeurs', 'fierte', 'Fierté', 2.0, 'Réponse parfaite', [m.dresse(7, .5, .45), m.deploie(18, 1.2, .5, .45), m.approche(.08)], E('open', .2, 'croissant', .85, 'open'), null, [f.losanges(1, .35, .45)]);
  A('humeurs', 'gene', 'Gêne', 2.2, 'Il s’est trompé', [m.cache(.5, .45), m.regard([[0, 0, 0], [.25, -.8, .7], [.8, -.8, .7], [1, 0, 0]]), m.replie(-18, .9)], 'open', k.vers('vi', .5, .45));
  A('humeurs', 'doute', 'Doute', 2.2, 'Info non vérifiée', [m.sourcil(1, 1.2, .5, .45), m.incline(10, .5, .45), m.kf('ht', [[0, 0], [.3, -8], [.75, -8], [1, 0]])], E('open', .35, 'small', .7, 'open'), null, [f.texte('?', .3, .55)]);
  A('humeurs', 'tristesse', 'Tristesse', 2.6, 'Une mauvaise nouvelle', [m.affaisse(10, .5, .45), m.coule(.14, .5, .45), m.sourcils(.5, -1, .5, .45), m.replie(-24, .9, .5, .45)], E('open', .3, 'small', .85, 'open'), k.vers('in', .5, .45));
  A('humeurs', 'contrariete', 'Contrariété', 1.8, 'Spam insistant', [m.sourcils(0, 1.1, .5, .42), m.tremble(.02), m.kf('ht', [[0, 0], [.2, 4], [.3, -4], [.4, 4], [.5, -4], [.6, 4], [.7, 0], [1, 0]])], 'small', k.vers('vi', .5, .4), [f.etincelles(4, .3, .3)]);
  A('humeurs', 'emerveille', 'Émerveillé', 2.4, 'Une belle photo', [m.yeux(1.2, .5, .45), m.lueur(1.2, .5, .45), m.monte(.14)], E('open', .2, 'wide', .85, 'open'), k.vers('c2', .5, .45, .6), [f.lucioles(5)]);
  A('humeurs', 'timide', 'Timide', 2.2, 'Un compliment', [m.cache(.5, .4), m.regard([[0, 0, 0], [.25, .6, .6], [.75, .6, .6], [1, 0, 0]]), m.enlace(.5, .35)], E('open', .35, 'croissant', .75, 'open'), k.vers('vi', .5, .4));
  A('humeurs', 'fou_rire', 'Fou rire', 1.8, 'Une blague', [m.kf('r', [[0, 0], [.1, 6], [.2, -6], [.3, 6], [.4, -6], [.5, 6], [.6, -6], [.7, 4], [1, 0]]), m.hoche(4), m.bat(5, 14)], 'happy');
  A('humeurs', 'frayeur', 'Frayeur', 1.8, 'Bruit soudain', [m.recul(), m.frisson(6), m.sourcils(1.2, 0, .3, .3)], E('wide', .7, 'open'), k.eclat('wh', .1, .1));
  A('humeurs', 'tendresse', 'Tendresse', 2.6, 'Message d’un proche', [m.lanterne(6, 1), m.lueur(.5)], E('open', .2, 'coeur', .85, 'open'), k.vers('vi', .5, .45, .4), [f.icone('coeur', .3, .55, 0, -.85, .22, 'c2')]);
  A('humeurs', 'ennui', 'Ennui', 2.8, 'Rien à faire', [m.affaisse(7, .5, .45), m.paupiere(.5, .5, .45), m.kf('wl', [[0, 0], [.3, -25], [.7, -25], [1, 0]]), m.kf('x', [[0, 0], [.5, -.08], [1, 0]], 'sn')], 'open');
  A('humeurs', 'impatience', 'Impatience', 2.2, 'Le chargement est long', [m.hoche(5), m.regard([[0, 0, 0], [.2, 0, -1], [.4, -.8, -.4], [.6, 0, -1], [.8, .8, -.4], [1, 0, 0]]), m.alterne(5, 12)], 'open');

  A('magie', 'feux_follets', 'Feux follets', 2.6, 'Soirée calme', [m.flot(.04, 2), m.lueur(.4)], E('open', .3, 'croissant', .8, 'open'), null, [f.follets(3, 1.05, 1, .22)]);
  A('magie', 'cercle_runes', 'Cercle de runes', 2.6, 'Il prépare une formule', [m.monte(.12), m.runes(2, 1)], 'losange', k.tient('cy', .5), [f.cercle(1.1, 1, .05, .9)]);
  A('magie', 'pluie_plumes', 'Pluie de plumes', 2.4, 'Félicitations', [m.deploie(24, 1.3, .3, .25), m.flot(.03, 2)], 'croissant', null, [f.plumes(10, .2, .75)]);
  A('magie', 'invocation', 'Invocation', 2.4, 'Il fait apparaître un résultat', [m.kf('wl,wr', [[0, 0], [.3, 45], [.5, 45], [.6, -10], [1, 0]]), m.flash(.55, .08), m.monte(.1, .4, .3)], E('open', .3, 'losange', .7, 'open'), k.eclat('wh', .55, .12), [f.converge(10, .1, .4), f.icone('rune', .55, .4, 0, -1.05, .4, 'cy')]);
  A('magie', 'aurore_boreale', 'Aurore boréale', 2.8, 'Thème de nuit', [m.flot(.04, 1), m.vague(.04, 1)], 'open', k.cycle(['cy', 'aq', 'in', 'vi'], 1, .6), [f.brume(5, .05, .9)]);
  A('magie', 'givre', 'Givre', 2.4, 'Il fait très froid', [m.frisson(5), m.replie(-14, .9)], 'small', k.tient('gl', .5), [f.lucioles(6, 'wh', 'gl')]);
  A('magie', 'foudre', 'Foudre bleue', 1.8, 'Plein d’énergie', [m.tremble(.025), m.dresse(6, .35, .3)], 'wide', k.eclat('wh', .3, .12), [f.etincelles(10, .25, .4, 1), f.etincelles(8, .55, .35)]);
  A('magie', 'lucioles', 'Lucioles', 2.8, 'Fin de soirée', [m.regard([[0, 0, 0], [.25, -.7, -.3], [.5, .6, .2], [.75, -.3, .4], [1, 0, 0]])], 'open', null, [f.lucioles(7)]);
  A('magie', 'sortilege', 'Sortilège', 2.4, 'Mini-jeu en ligne', [m.tourne(2), m.grandit(1.5, .5, .4)], E('open', .2, 'losange', .85, 'open'), k.vers('vi', .5, .4, .6), [f.losanges(2, .2, .6)]);
  A('magie', 'vortex', 'Vortex', 2.6, 'Nettoyage du cache', [m.kf('r', [[0, 0], [.2, -8], [.4, 8], [.6, -8], [.8, 8], [1, 0]]), m.lueur(.6)], 'anneau', k.tient('cy', .4), [f.vortex(14, .05, .9)]);
  A('magie', 'lumiere', 'Lumière douce', 2.4, 'Lecture de nuit', [m.aura(1.2, .5, .45), m.monte(.08)], 'croissant', k.tient('c2', .8), [f.braises(6, .1, .8)]);
  A('magie', 'brume_magique', 'Brume magique', 2.6, 'Il fait patienter avec style', [m.vague(.05, 2), m.runes(2, .6)], 'open', k.cycle(['c4', 'in', 'c4'], 1), [f.brume(6, .05, .9), f.lucioles(3)]);
  A('magie', 'metamorphose', 'Métamorphose', 2.4, 'Changement de thème', [m.kf('hc', [[0, 0], [.3, .7], [.7, .7], [1, 0]]), m.flash(.5, .1), m.kf('s', [[0, 1], [.45, .85], [.55, 1.12], [1, 1]])], E('open', .45, 'closed', .55, 'wide', .8, 'open'), k.cycle(['vi', 'cy', 'c5'], 1, .6), [f.converge(10, .3, .3)]);

  A('veille', 'respiration', 'Respiration lumineuse', 2.8, 'Rien à faire', [m.runes(1, .5), m.lueur(.4, .5, .5), m.flot(.03, 1)], 'open');
  A('veille', 'somnole', 'Somnole', 2.8, 'Tard le soir', [m.kf('lid', [[0, 0], [.5, .75], [.62, .75], [.66, 0], [1, 0]]), m.kf('ht', [[0, 0], [.5, 9], [.62, 9], [.68, 0], [1, 0]]), m.kf('y', [[0, 0], [.5, .08], [.62, .08], [.66, -.04], [1, 0]])], 'open');
  A('veille', 'vagabond', 'Regard vagabond', 2.8, 'Il est curieux', [m.regard([[0, 0, 0], [.2, -.8, -.3], [.4, -.8, -.3], [.55, .7, .4], [.75, .7, .4], [1, 0, 0]]), m.kf('ht', [[0, 0], [.2, -4], [.4, -4], [.55, 4], [.75, 4], [1, 0]])], 'open');
  A('veille', 'toilettage', 'Toilettage', 2.6, 'Il lisse ses plumes', [m.kf('wl', [[0, 0], [.2, 35], [.8, 35], [1, 0]]), m.kf('r', [[0, 0], [.2, -10], [.8, -10], [1, 0]]), m.regard([[0, 0, 0], [.2, -1, .2], [.8, -1, .2], [1, 0, 0]]), m.kf('ht', [[0, 0], [.3, -3], [.4, -6], [.5, -3], [.6, -6], [.7, -3], [1, 0]])], E('open', .3, 'happy', .75, 'open'), null, [f.plumes(2, .45, .5)]);
  A('veille', 'baille', 'Bâillement', 2.2, 'Un long moment sans rien', [m.deploie(16, 1.1, .45, .35), m.kf('hh', [[0, 0], [.45, 5], [.7, 0], [1, 0]]), m.kf('sy', [[0, 1], [.45, 1.08], [.7, 1], [1, 1]])], E('open', .25, 'closed', .78, 'open'));
  A('veille', 'derive', 'Dérive', 2.8, 'Écran d’accueil', [m.kf('x', [[0, 0], [.5, .2], [1, 0]], 'sn'), m.vague(.05, 1)], 'open');
  A('veille', 'clignement', 'Clignement', 1.0, 'Toutes les quelques secondes', [m.kf('blink', [[0, 0], [.3, 1], [.45, 0], [.6, 1], [.75, 0], [1, 0]])], 'open');
  A('veille', 'joue_follet', 'Joue avec un follet', 2.8, 'Il s’amuse tout seul', [m.suitFollet(1.2)], 'open', null, [f.follets(1, 1, 1.2, .26)]);
  A('veille', 'attente', 'Attente', 2.6, 'Vous tapez un message', [m.alterne(4, 8), m.regard([[0, 0, 0], [.15, 0, .5], [.85, 0, .5], [1, 0, 0]])], 'open');
  A('veille', 'reve', 'Rêve', 2.8, 'Pendant la nuit', [m.kf('y', [[0, 0], [.5, .05], [1, 0]], 'sn'), m.replie(-20, .85, .5, .5), m.runes(1, .4)], 'closed', k.vers('in', .5, .5), [f.glyphes(2, .2, .7), f.texte('z', .5, .4)]);
  A('veille', 'bercement', 'Bercement', 2.8, 'Calme du soir', [m.lanterne(8, 1.5)], E('open', .3, 'closed', .8, 'open'));
  A('veille', 'scintillement', 'Scintillement', 2.0, 'De temps en temps', [m.scintille(6)], 'open');
  A('veille', 'pose', 'Pose', 2.2, 'Il prend la pose', [m.dresse(6, .45, .35), m.deploie(20, 1.15, .45, .35), m.incline(-8, .45, .35)], E('open', .3, 'clin', .65, 'open'), null, [f.losanges(1, .35, .4)]);

  X('arrivee', 1.5, [m.kf('op', [[0, 0], [.3, 0], [.6, 1], [1, 1]]), m.kf('sy', [[0, 1.4], [.3, 1.4], [.65, 1], [1, 1]]), m.kf('sx', [[0, .6], [.3, .6], [.65, 1], [1, 1]]), m.kf('y', [[0, .3], [.3, .3], [.65, 0], [1, 0]]), m.allume(.5, .4), m.kf('wl,wr', [[0, -40], [.55, -40], [.85, 6], [1, 0]]), m.kf('ws', [[0, .5], [.55, .5], [.85, 1.06], [1, 1]])], E('closed', .7, 'wide', .9, 'open'), k.vers('cy', .62, .3, .9), [f.converge(14, 0, .5), f.losanges(1, .6, .35)], true);
  X('depart', 1.0, [m.kf('wl,wr', [[0, 0], [.25, -40], [1, -40]]), m.kf('ws', [[0, 1], [.25, .6], [1, .6]]), m.kf('op', [[0, 1], [.35, 1], [.9, 0], [1, 0]]), m.kf('sy', [[0, 1], [.35, 1], [.9, 1.45], [1, 1.45]]), m.kf('sx', [[0, 1], [.35, 1], [.9, .65], [1, .65]]), m.kf('y', [[0, 0], [.35, 0], [.9, -.4], [1, -.4]]), m.kf('rg', [[0, 0], [.3, -1], [1, -1]])], E('open', .2, 'closed'), null, [f.braises(8, .3, .6)], true);
  X('vole_bulle', .8, [m.bat(2, 20), m.deploie(14, 1.15, .5, .5)], 'wide');
  X('pose_bulle', .7, [m.kf('wl,wr', [[0, 0], [.3, 24], [.6, -8], [1, 0]]), m.kf('y', [[0, 0], [.3, -.06], [.7, 0], [1, 0]])], E('open', .55, 'happy', .9, 'open'), null, [f.brume(3, .2, .6)]);
  X('rentre', .7, [m.bat(3, 22)], 'open');

  const FAMS = [
    { id: 'apparition', n: 'Apparitions', d: 'Se former, se dissoudre, passer d’un portail à l’autre.' },
    { id: 'vol', n: 'Vol', d: 'Planer, piquer, boucler. Jamais un rebond.' },
    { id: 'ailes', n: 'Ailes', d: 'Saluer, applaudir, s’abriter, montrer.' },
    { id: 'capuche', n: 'Capuche', d: 'La pointe est son antenne : elle se dresse, tombe, sonne.' },
    { id: 'regard', n: 'Regard', d: 'Ses yeux de lumière cherchent, sourient, deviennent runes.' },
    { id: 'runes', n: 'Runes', d: 'Les trois runes du front s’allument et parlent.' },
    { id: 'reseau', n: 'Réseau', d: 'Se connecter, chercher, télécharger, synchroniser.' },
    { id: 'messages', n: 'Messages', d: 'Il apporte les nouvelles comme un messager.' },
    { id: 'garde', n: 'Garde', d: 'Il veille sur le téléphone et sur vos données.' },
    { id: 'humeurs', n: 'Humeurs', d: 'Joie, doute, gêne, tendresse, à sa façon.' },
    { id: 'magie', n: 'Magie', d: 'Feux follets, cercles de runes, plumes de lumière.' },
    { id: 'veille', n: 'Veille', d: 'Vivre doucement quand rien ne se passe.' }
  ];
  const TAP = ['coucou', 'clin', 'sourire', 'oui', 'pointe_dressee', 'cils', 'chapeau', 'lanterne'];
  const AMB = LIST.filter(a => a.fam === 'veille').map(a => a.id);

  /* ---------- effets ---------- */
  function fxp(o, p, S, X, Y, AX, AY, TX, TY, out) {
    const k = o.k;
    if (k === 'plumes') { const q = seg(p, o.at, o.at + o.l); if (q <= 0 || q >= 1) return; for (let i = 0; i < o.n; i++) { const sd = i % 2 ? 1 : -1, t = q * (.85 + rnd(i, 1) * .3); out.f.push({ sh: 'plume', x: X + sd * S * (.55 + .35 * rnd(i, 2)) + sin(t * 9 + i) * S * .12, y: Y - S * .15 + t * S * 1.25, z: S * .1 * (.8 + .4 * rnd(i, 3)), r: sin(t * 7 + i) * 35 + sd * 30, op: min(1, q * 6) * (1 - seg(q, .7, 1)), c: i % 3 ? 'c2' : 'c1' }); } return; }
    if (k === 'follets') { const e = env(p, .12, .2); if (e <= 0) return; for (let i = 0; i < o.n; i++) { const a = TAU * (o.t * p + i / o.n), fr = sin(a) > 0; (fr ? out.f : out.b).push({ sh: 'follet', x: X + cos(a) * o.r * S * .75, y: Y + S * .05 + sin(a) * o.r * S * .3 - S * .04 * sin(p * 20 + i), z: o.z * S * .5 * e * (fr ? 1 : .75), r: cos(a) * 18, op: e * (fr ? .95 : .55), c: fr ? 'c3' : 'c4' }); } return; }
    if (k === 'braises') { for (let i = 0; i < o.n; i++) { const st = o.at + rnd(i, 4) * o.l * .4, q = seg(p, st, st + o.l * .6); if (q <= 0 || q >= 1) continue; out.f.push({ sh: 'follet', x: X + (rnd(i, 1) - .5) * S * 1.1 + sin(q * 8 + i) * S * .08, y: Y - S * (.2 + q * 1.1), z: S * .07 * (1 - .5 * q), r: sin(q * 6 + i) * 15, op: min(1, q * 5) * (1 - q), c: i % 2 ? 'c3' : 'cy' }); } return; }
    if (k === 'glyphes') { for (let i = 0; i < o.n; i++) { const st = o.at + i * o.l * .2, q = seg(p, st, st + o.l * .6); if (q <= 0 || q >= 1) continue; out.f.push({ sh: i % 2 ? 'chev' : 'rune', x: X + (i - (o.n - 1) / 2) * S * .38 + sin(q * 5 + i) * S * .06, y: TY - S * (.1 + .9 * oc(q)), z: S * .1, r: (i - 1) * 12, op: min(1, q * 6) * (1 - seg(q, .6, 1)), c: 'cy' }); } return; }
    if (k === 'octets') { for (let i = 0; i < o.n; i++) { const st = o.at + (i / o.n) * o.l * .55, q = seg(p, st, st + o.l * .45); if (q <= 0 || q >= 1) continue; const t = o.dir > 0 ? q : 1 - q; out.f.push({ sh: 'octet', x: TX + (rnd(i, 1) - .5) * S * .4 * (1 - t), y: TY - S * .05 - S * 1.05 * (1 - t), z: S * .045 * (rnd(i, 2) > .5 ? 1 : .7), r: 0, op: o.dir > 0 ? min(1, q * 4) * (1 - seg(q, .85, 1)) : min(1, q * 8) * (1 - seg(q, .6, 1)), c: i % 3 ? 'cy' : 'c2' }); } return; }
    if (k === 'ondes') { if (p < o.at || p > o.at + o.l) return; const e = env(seg(p, o.at, o.at + o.l), .1, .15); for (let i = 0; i < o.n; i++) { const q = (p - o.at) / o.l * 2.2 - i * .33; if (q < 0) continue; const g = q - flo(q); out.f.push({ sh: 'arc', x: TX, y: TY - S * (.1 + .3 * g), z: S * (.07 + .2 * g), r: 0, op: e * (1 - g) * min(1, g * 6), c: 'cy' }); } return; }
    if (k === 'nuage') { const q = seg(p, o.at, o.at + o.l), e = env(q, .15, .2); if (e <= 0) return; const cx = (o.fixe ? AX : X) + S * .05, cy = (o.fixe ? AY : Y) - S * 1.05; out.b.push({ sh: 'nuage', x: cx, y: cy, z: S * .34, r: 0, op: e * .9, c: 'c2' }); if (o.rain) { for (let i = 0; i < 6; i++) { const t = (q * 3 + i / 6) % 1; out.f.push({ sh: 'point', x: cx + (i / 5 - .5) * S * .5, y: cy + S * (.12 + .5 * t), z: S * .025, r: 0, op: e * (1 - t), c: 'c3' }); } } else { const a = (q * 2) % 1, v = e * bell(a, .5, .5); out.f.push({ sh: 'fleche', x: cx - S * .1, y: cy + S * .02 - S * .1 * (a - .5), z: S * .07, r: 180, op: v, c: 'c7' }); out.f.push({ sh: 'fleche', x: cx + S * .12, y: cy + S * .02 + S * .1 * (a - .5), z: S * .07, r: 0, op: v, c: 'c7' }); } return; }
    if (k === 'cercle') { const q = seg(p, o.at, o.at + o.l), e = env(q, .2, .25); if (e <= 0) return; const cy = Y + S * .55, R = S * o.r * (.7 + .3 * e); out.o.push({ x: X, y: cy, rx: R, ry: R * .3, w: max(1, S * .025), op: e * .9, c: 'cy', dash: S * .09, off: S * 2 * o.t * p }); for (let i = 0; i < 3; i++) { const a = TAU * (o.t * p * .5 + i / 3); out.f.push({ sh: 'losange', x: X + cos(a) * R, y: cy + sin(a) * R * .3, z: S * .07 * e, r: 0, op: e, c: 'cy' }); } return; }
    if (k === 'portail') { const q = seg(p, o.at, o.at + o.l), e = bell(q, .5, .5); if (e <= 0) return; out.o.push({ x: AX, y: AY + S * .65, rx: S * .6 * e, ry: S * .13 * e, w: max(1.5, S * .04), op: e, c: 'cy' }); out.o.push({ x: AX, y: AY - S * 1.15, rx: S * .6 * e, ry: S * .13 * e, w: max(1.5, S * .04), op: e * .85, c: 'c3' }); return; }
    if (k === 'losanges') { for (let i = 0; i < o.n; i++) { const st = o.at + i * o.l * .3, q = seg(p, st, st + o.l * .7); if (q <= 0 || q >= 1) continue; out.b.push({ sh: 'losfin', x: X, y: Y, z: S * (.55 + 1.1 * oc(q)), r: 0, op: (1 - q) * .85, c: 'cy' }); } return; }
    if (k === 'etincelles') { const q = seg(p, o.at, o.at + o.l); if (q <= 0 || q >= 1) return; const ox = o.tip ? TX : X, oy = o.tip ? TY : Y, R = o.tip ? .5 : 1; for (let i = 0; i < o.n; i++) { const a = i / o.n * TAU + rnd(i, 2), d = S * R * (.5 + .55 * oc(q)) * (.8 + .4 * rnd(i, 3)); out.f.push({ sh: 'eclair', x: ox + cos(a) * d, y: oy + sin(a) * d, z: S * .07 * (1 - .5 * q), r: a * 57.3 + 90, op: 1 - q * q, c: i % 2 ? 'wh' : 'cy' }); } return; }
    if (k === 'lucioles') { const e = env(p, .12, .18); if (e <= 0) return; for (let i = 0; i < o.n; i++) { const t = p * 2.2 + i * 1.7; out.f.push({ sh: 'point', x: X + wav(t, i) * S * 1.1, y: Y - S * .1 + wav(t * .8, i + 9) * S * .55, z: S * .035 * (.7 + .5 * (.5 + .5 * sin(t * 4 + i))), r: 0, op: e * (.5 + .5 * sin(t * 5 + i * 2)), c: i % 2 ? (o.c2 || 'aq') : (o.c1 || 'cy') }); } return; }
    if (k === 'icone') { const q = seg(p, o.at, o.at + o.l); if (q <= 0 || q >= 1) return; out.f.push({ sh: o.sh, x: X + o.dx * S, y: Y + o.dy * S - S * .1 * oc(q), z: S * o.z * .5 * (q < .25 ? oc(q / .25) : 1), r: 0, op: min(1, q * 6) * (1 - seg(q, .75, 1)), c: o.c }); return; }
    if (k === 'texte') { const q = seg(p, o.at, o.at + o.l); if (q <= 0 || q >= 1) return; out.x.push({ t: o.t, x: X + S * .68, y: Y - S * .6 - S * .28 * oc(q), size: S * (o.t.length > 1 ? .3 : .46), op: min(1, q * 6) * (1 - seg(q, .7, 1)), c: 'c2' }); return; }
    if (k === 'double') { const b = bell(p, .5, .42); if (b <= 0) return; out.g.push({ dx: -o.d * S * b, op: .42 * b }); out.g.push({ dx: o.d * S * b, op: .42 * b }); return; }
    if (k === 'converge') { const q = seg(p, o.at, o.at + o.l); if (q <= 0 || q >= 1) return; for (let i = 0; i < o.n; i++) { const a = i / o.n * TAU + rnd(i, 5), d = S * 1.3 * (1 - io(q)) * (.8 + .4 * rnd(i, 6)); out.f.push({ sh: i % 3 ? 'point' : 'losange', x: AX + cos(a) * d, y: AY + sin(a) * d * .8, z: S * (i % 3 ? .045 : .06), r: a * 57.3, op: min(1, q * 4) * (1 - seg(q, .85, 1)), c: i % 2 ? 'cy' : 'c2' }); } return; }
    if (k === 'vortex') { const q = seg(p, o.at, o.at + o.l); if (q <= 0 || q >= 1) return; const e = env(q, .1, .15); for (let i = 0; i < o.n; i++) { const st = i / o.n, t = (q * 1.6 + st) % 1, a = TAU * (t * 1.6 + st), d = S * 1.2 * (1 - t); out.f.push({ sh: 'point', x: X + cos(a) * d, y: Y + sin(a) * d * .5, z: S * .04 * (1 - t * .5), r: 0, op: (1 - t) * min(1, t * 6) * e, c: i % 2 ? 'cy' : 'c3' }); } return; }
    if (k === 'faisceaux') { const q = seg(p, o.at, o.at + o.l), e = env(q, .15, .2); if (e <= 0) return; [-1, 1].forEach(sd => out.f.push({ sh: 'faisceau', x: X + sd * S * .19, y: Y + S * .72, z: S * .5, r: sd * 6, op: e * .3, c: 'c2' })); return; }
    if (k === 'brume') { const e = env(p, .15, .2); if (e <= 0) return; for (let i = 0; i < o.n; i++) { const t = p * 1.3 + i * .37, u = ((t + rnd(i, 1)) % 1 + 1) % 1; out.b.push({ sh: 'brume', x: X + (u - .5) * S * 2.2, y: Y + S * (.15 + .25 * rnd(i, 2)), z: S * .5 * (.7 + .5 * rnd(i, 3)), r: 0, op: e * .22, c: 'c2' }); } return; }
    if (k === 'pages') { for (let i = 0; i < o.n; i++) { const st = o.at + i * o.l * .22, q = seg(p, st, st + o.l * .5); if (q <= 0) continue; const land = oc(q), sd = i % 2 ? 1 : -1; out.f.push({ sh: 'page', x: X + S * (.85 - .1 * i) + S * .9 * (1 - land) * sd, y: Y - S * .2 + i * S * .04 - S * .6 * (1 - land), z: S * .16, r: (1 - land) * 60 * sd + (i - 1) * 6, op: min(1, q * 5) * (1 - seg(p, o.at + o.l, min(1, o.at + o.l + .12))), c: 'c1' }); } return; }
    if (k === 'points') { const q = seg(p, o.at, o.at + o.l), e = env(q, .1, .15); if (e <= 0) return; for (let i = 0; i < 3; i++) { const v = .5 + .5 * sin(TAU * (p * 3 - i * .18)); out.f.push({ sh: 'point', x: X + S * (.64 + i * .17), y: Y - S * .5 - S * .05 * v, z: S * .045, r: 0, op: e * (.35 + .65 * v), c: 'c2' }); } return; }
    if (k === 'tient') { const q = seg(p, o.at, o.at + o.l), e = env(q, .15, .2); if (e <= 0) return; out.f.push({ sh: o.sh, x: (o.fixe ? AX : X) + o.dx * S, y: (o.fixe ? AY : Y) + o.dy * S + sin(p * 12) * S * .02, z: S * o.z * .5 * (.85 + .15 * e), r: sin(p * 9) * 5, op: e, c: o.c }); return; }
    if (k === 'eclabousse') { const q = seg(p, o.at, o.at + o.l); if (q <= 0 || q >= 1) return; for (let i = 0; i < o.n; i++) { const a = i / o.n * TAU, vx = cos(a) * 1.4, vy = -.8 - rnd(i, 2) * .6; out.f.push({ sh: 'point', x: X + vx * S * q, y: Y + (vy * q + 1.6 * q * q) * S, z: S * .035, r: 0, op: 1 - q, c: 'c3' }); } return; }
    if (k === 'lance') { const q = seg(p, o.at, o.at + o.l); if (q <= 0 || q >= 1) return; out.f.push({ sh: o.sh, x: X + S * .5 + S * 2 * q, y: Y - S * .3 - S * .6 * sin(PI * q), z: S * .12, r: 360 * q, op: min(1, q * 8) * (1 - seg(q, .75, 1)), c: 'cy' }); }
  }

  /* ---------- images clés ---------- */
  const ADD = ['x', 'y', 'r', 'pr', 'ht', 'hh', 'wl', 'wr', 'wg', 'wf', 'ex', 'ey', 'eg', 'lid', 'bl', 'br', 'ba', 'rg', 'r1', 'r2', 'r3', 'rr', 'ag', 'hc', 'blink'];
  const MUL = ['s', 'sx', 'sy', 'op', 'bop', 'ws', 'es', 'rs', 'bo'];
  const MULS = {}; MUL.forEach(c => { MULS[c] = 1; });
  const Z = () => { const z = {}; ADD.forEach(c => { z[c] = 0; }); MUL.forEach(c => { z[c] = 1; }); z.hold = 0; z.col = null; z.eyes = 'open'; z.A = null; z.p = 0; return z; };
  function evalClip(A, p, base) {
    const fr = Z(); fr.col = base; fr.A = A; fr.p = p;
    for (let i = 0; i < A.t.length; i++) { const v = A.t[i](p); for (const c in v) { if (MULS[c]) fr[c] *= v[c]; else fr[c] = (fr[c] || 0) + v[c]; } }
    if (A.c) { const v = A.c(p, base); if (v.col) fr.col = v.col; if (v.ag) fr.ag += v.ag; }
    const e = A.e; if (typeof e === 'string') fr.eyes = e; else { let cur = e[0][1]; for (let i = 0; i < e.length; i++) if (p >= e[i][0]) cur = e[i][1]; fr.eyes = cur; }
    return fr;
  }
  function compose(mf, c, w) {
    const fr = Object.assign({}, mf), hold = (c.hold || 0) * w;
    if (hold) ['y', 'wl', 'wr', 'ht', 'rg', 'ex', 'ey'].forEach(q => { fr[q] *= 1 - hold; });
    ADD.forEach(q => { const v = (q === 'r' || q === 'pr' || q === 'rr') ? nA(c[q]) : c[q]; fr[q] += v * w; });
    MUL.forEach(q => { fr[q] *= 1 + (c[q] - 1) * w; });
    fr.col = mix(mf.col, c.col, w);
    if (c.eyes && c.eyes !== 'open' && w > .5) fr.eyes = c.eyes;
    fr.A = c.A; fr.p = c.p; return fr;
  }
  function lerpF(a, b, w) {
    if (w >= 1) return b; if (w <= 0) return a;
    const fr = Object.assign({}, b);
    ADD.concat(MUL).forEach(q => { fr[q] = a[q] + (b[q] - a[q]) * w; });
    fr.col = mix(a.col, b.col, w); fr.eyes = w < .5 ? a.eyes : b.eyes; return fr;
  }

  /* ---------- capteurs (partagés avec l’étoile) ---------- */
  const OWN = { beta: 0, gamma: 0, face: false, listeners: new Set() };
  const sens = () => (window.ETOILE && window.ETOILE.sensors) || OWN;

  /* ---------- scène ---------- */
  let UID = 0, REDUCE = false, raf = 0, last = 0;
  try { REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { }
  const STAGES = new Set();
  function loop(ts) { raf = 0; const dt = last ? min(.05, max(0, (ts - last) / 1000)) : .016; last = ts; STAGES.forEach(s => { if (s.err) return; try { s.tick(dt); } catch (e) { s.err = true; if (window.console) console.error('Esprit :', e); } }); if (STAGES.size) raf = requestAnimationFrame(loop); else last = 0; }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  class Spr { constructor(v) { this.v = v; this.t = v; this.d = 0; } to(t, snap) { this.t = t; if (snap) { this.v = t; this.d = 0; } } step(dt) { const a = (this.t - this.v) * 120 - this.d * 22; this.d += a * dt; this.v += this.d * dt; return this.v; } }
  const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); if (attrs) for (const q in attrs) e.setAttribute(q, attrs[q]); if (parent) parent.appendChild(e); return e; };
  const colOf = (c, acc) => c === 'acc' ? acc : (HEX[c] || acc);
  function paintP(pool, items, acc) { for (let i = 0; i < pool.length; i++) { const n = pool[i], it = items[i]; if (!it) { if (n._on) { n.setAttribute('opacity', '0'); n._on = false; } continue; } if (n._sh !== it.sh) { n.setAttribute('d', SH[it.sh] || SH.point); n._sh = it.sh; } n.setAttribute('transform', 'translate(' + it.x.toFixed(1) + ' ' + it.y.toFixed(1) + ') rotate(' + (it.r || 0).toFixed(1) + ') scale(' + max(.001, it.z / 10).toFixed(3) + ')'); n.setAttribute('fill', colOf(it.c, acc)); n.setAttribute('opacity', cl(it.op, 0, 1).toFixed(3)); n._on = true; } }
  function paintO(pool, items, acc) { for (let i = 0; i < pool.length; i++) { const n = pool[i], it = items[i]; if (!it) { if (n._on) { n.setAttribute('opacity', '0'); n._on = false; } continue; } n.setAttribute('cx', it.x.toFixed(1)); n.setAttribute('cy', it.y.toFixed(1)); n.setAttribute('rx', max(.1, it.rx).toFixed(1)); n.setAttribute('ry', max(.1, it.ry).toFixed(1)); n.setAttribute('stroke', colOf(it.c, acc)); n.setAttribute('stroke-width', it.w.toFixed(2)); n.setAttribute('opacity', cl(it.op, 0, 1).toFixed(3)); if (it.dash) { n.setAttribute('stroke-dasharray', it.dash.toFixed(1) + ' ' + (it.dash * .8).toFixed(1)); n.setAttribute('stroke-dashoffset', (it.off || 0).toFixed(1)); n._d = true; } else if (n._d) { n.removeAttribute('stroke-dasharray'); n.removeAttribute('stroke-dashoffset'); n._d = false; } n._on = true; } }
  function paintX(pool, items, acc) { for (let i = 0; i < pool.length; i++) { const n = pool[i], it = items[i]; if (!it) { if (n._on) { n.setAttribute('opacity', '0'); n._on = false; } continue; } if (n.textContent !== it.t) n.textContent = it.t; n.setAttribute('x', it.x.toFixed(1)); n.setAttribute('y', it.y.toFixed(1)); n.setAttribute('font-size', max(6, it.size).toFixed(1)); n.setAttribute('fill', colOf(it.c, acc)); n.setAttribute('opacity', cl(it.op, 0, 1).toFixed(3)); n._on = true; } }

  class Stage {
    constructor(host, o) {
      this.o = o = Object.assign({ w: 200, h: 200, x: 100, y: 100, size: 60, motion: true, react: true, ambient: false, follow: true, speed: 1, present: true, still: false, pools: [40, 14, 4, 3] }, o || {});
      this.host = host; this.uid = ++UID;
      this.ax = new Spr(o.x); this.ay = new Spr(o.y); this.as = new Spr(o.size);
      this.trk = o.track || [o.x, o.x];
      this.bFrom = L.c5; this.bTo = L.c5; this.bT0 = -9;
      this.mode = o.mode || 'idle'; this.mPrev = this.mode; this.mT0 = -9;
      this.t = 0; this.clip = null; this.snap = null; this.cur = null; this.drawn = false;
      this.off = 0; this.vel = 0; this.drag = null; this.flight = null;
      this.present = o.present !== false;
      this.hist = []; this.blinkAt = 1.2 + Math.random() * 2.5; this.ambAt = 7 + Math.random() * 6; this.lookAt = 2; this.look = [0, 0]; this.lookT = [0, 0];
      this.vis = true; this.dead = false; this.err = false;
      this.build();
      if (o.react) { this.sub = type => this.onSens(type); sens().listeners.add(this.sub); }
      if (typeof IntersectionObserver !== 'undefined') { this.io = new IntersectionObserver(es => es.forEach(e => { this.vis = e.isIntersecting; if (this.vis) this.drawn = false; })); this.io.observe(host); }
      STAGES.add(this); kick();
    }
    build() {
      const o = this.o, id = 'esp' + this.uid, U = s => 'url(#' + id + s + ')', P = o.pools;
      this.U = U;
      const svg = this.svg = mk('svg', { width: o.w, height: o.h, viewBox: '0 0 ' + o.w + ' ' + o.h, style: 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none' });
      const defs = mk('defs', null, svg);
      const stop = (g, off, col, op) => mk('stop', { offset: off, 'stop-color': col, 'stop-opacity': op == null ? 1 : op }, g);
      const hg = mk('linearGradient', { id: id + 'h', x1: '0', y1: '0', x2: '1', y2: '1' }, defs); this.hs = [stop(hg, '0', HEX.h1), stop(hg, '.55', HEX.h2), stop(hg, '1', HEX.h3)];
      const rg = mk('linearGradient', { id: id + 'r', x1: '0', y1: '0', x2: '1', y2: '1' }, defs); stop(rg, '0', HEX.r1); stop(rg, '.6', HEX.r2); stop(rg, '1', HEX.r3);
      const vg = mk('radialGradient', { id: id + 'v', cx: '.5', cy: '.38', r: '.7' }, defs); stop(vg, '0', '#0b0d14'); stop(vg, '1', HEX.vd);
      const ig = mk('radialGradient', { id: id + 'i', cx: '.38', cy: '.66', r: '.72' }, defs); this.is = [stop(ig, '0', HEX.c3), stop(ig, '.62', HEX.c5), stop(ig, '1', HEX.cy)];
      const eg = mk('radialGradient', { id: id + 'e' }, defs); this.es = [stop(eg, '0', HEX.c5, .55), stop(eg, '1', HEX.c5, 0)];
      const wg = mk('linearGradient', { id: id + 'w', x1: '-36', y1: '10', x2: '2', y2: '0', gradientUnits: 'userSpaceOnUse' }, defs); this.ws = [stop(wg, '0', HEX.c1), stop(wg, '.5', HEX.c3), stop(wg, '1', HEX.c5)];
      const ag = mk('radialGradient', { id: id + 'a' }, defs); this.ags = [stop(ag, '0', HEX.c5, .5), stop(ag, '1', HEX.c5, 0)];
      const back = mk('g', null, svg);
      this.aura = mk('circle', { r: 0, fill: U('a'), opacity: 0 }, back);
      this.ghosts = [0, 1, 2].map(() => mk('path', { d: GHOST, opacity: 0 }, back));
      this.bPool = Array.from({ length: P[1] }, () => mk('path', { opacity: 0 }, back));
      this.oPool = Array.from({ length: P[2] }, () => mk('ellipse', { fill: 'none', opacity: 0 }, back));
      this.charG = mk('g', null, svg);
      this.bodyG = mk('g', null, this.charG);
      this.wingsB = this.mkWings(this.bodyG);
      this.hood = mk('path', { d: hoodD(0, 0), fill: U('h') }, this.bodyG);
      this.shade = mk('path', { d: shadeD(0, 0), fill: HEX.h4, opacity: .42 }, this.bodyG);
      this.runes = RUNES.map(d => { const g = mk('g', null, this.bodyG), glow = mk('path', { d, fill: 'none', 'stroke-width': 4.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: .3 }, g), main = mk('path', { d, fill: 'none', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g); return { g, glow, main }; });
      mk('path', { d: RIM, fill: U('r') }, this.bodyG);
      mk('path', { d: VOID, fill: U('v') }, this.bodyG);
      this.faceG = mk('g', null, this.charG);
      this.eyes = [-1, 1].map(sd => { const g = mk('g', null, this.faceG), glow = mk('circle', { r: 17, fill: U('e') }, g), shape = mk('g', null, g), lid = mk('rect', { x: -13, y: -15, width: 26, height: 0, fill: HEX.vd }, g); return { sd, g, glow, shape, lid, type: '', els: [], pg: null }; });
      this.brows = [-1, 1].map(() => mk('path', { d: BROW, fill: 'none', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, this.faceG));
      this.wingsF = this.mkWings(this.charG);
      const front = mk('g', null, svg);
      this.fPool = Array.from({ length: P[0] }, () => mk('path', { opacity: 0 }, front));
      this.xPool = Array.from({ length: P[3] }, () => mk('text', { 'text-anchor': 'middle', 'dominant-baseline': 'middle', opacity: 0, style: 'font-family:var(--font-heading)' }, front));
      this.host.appendChild(svg);
      this.lastTip = ''; this.colKey = ''; this.hcKey = '';
      this.paintCol(L.c5); this.paintHood(0);
    }
    mkWings(parent) { return [0, 1].map(() => { const g = mk('g', null, parent), glow = mk('ellipse', { cx: -17, cy: 8, rx: 27, ry: 15, transform: 'rotate(22 -17 8)', fill: this.U('a'), opacity: .5 }, g); FEATH.forEach((d, i) => mk('path', { d, fill: this.U('w'), opacity: [1, .92, .85][i] }, g)); return { g, glow }; }); }
    paintCol(c) {
      this.lastCol = c; const acc = rgb(c), br = rgb(mix(c, L.c1, .4)), cy = rgb(mix(c, L.cy, .35));
      this.accStr = acc; this.cBright = br; this.cPup = rgb(mix(c, L.pu, .7));
      this.is[0].setAttribute('stop-color', rgb(mix(c, L.c2, .55))); this.is[1].setAttribute('stop-color', acc); this.is[2].setAttribute('stop-color', rgb(mix(c, L.cy, .4)));
      this.es.forEach(s => s.setAttribute('stop-color', acc)); this.ags.forEach(s => s.setAttribute('stop-color', acc));
      this.ws[0].setAttribute('stop-color', rgb(mix(c, L.wh, .82))); this.ws[1].setAttribute('stop-color', rgb(mix(c, L.c2, .5))); this.ws[2].setAttribute('stop-color', acc);
      this.runes.forEach(r => { r.main.setAttribute('stroke', cy); r.glow.setAttribute('stroke', cy); });
      this.brows.forEach(b => b.setAttribute('stroke', cy));
      this.eyes.forEach(E2 => this.paintEye(E2));
    }
    paintHood(hc) { const tg = hc >= 0 ? (this.lastCol || L.c5) : L.vd, a = hc >= 0 ? hc * .55 : -hc * .85; ['h1', 'h2', 'h3'].forEach((q, i) => this.hs[i].setAttribute('stop-color', rgb(mix(L[q], tg, a)))); this.shade.setAttribute('fill', rgb(mix(L.h4, tg, a))); }
    buildEye(E2, type) {
      const g = E2.shape; while (g.firstChild) g.removeChild(g.firstChild); E2.els = []; E2.type = type; E2.pg = null;
      (SHAPES[type] || SHAPES.open).forEach(d => { let par = g; if (d.m) { if (!E2.pg) E2.pg = mk('g', null, g); par = E2.pg; } const e = mk(d.t, d.a, par); if (d.w) { e.setAttribute('fill', 'none'); e.setAttribute('stroke-width', d.w); e.setAttribute('stroke-linecap', 'round'); e.setAttribute('stroke-linejoin', 'round'); } E2.els.push({ e, k: d.k }); });
      this.paintEye(E2);
    }
    paintEye(E2) { (E2.els || []).forEach(o => { const e = o.e; if (o.k === 'iris') e.setAttribute('fill', this.U('i')); else if (o.k === 'pup') e.setAttribute('fill', this.cPup); else if (o.k === 'hi') e.setAttribute('fill', '#fff'); else if (o.k === 'hi2') { e.setAttribute('fill', '#fff'); e.setAttribute('opacity', '.8'); } else if (o.k === 'st' || o.k === 'ring') e.setAttribute('stroke', this.cBright); else if (o.k === 'fi') e.setAttribute('fill', this.cBright); else if (o.k === 'dim') { e.setAttribute('fill', this.cBright); e.setAttribute('opacity', '.5'); } }); }
    play(id) { const A2 = typeof id === 'string' ? BY[id] : id; if (!A2 || this.dead) return; if (this.cur) { this.snap = Object.assign({}, this.cur); this.snap.r = nA(this.snap.r); this.snap.pr = nA(this.snap.pr); this.snap.rr = nA(this.snap.rr); } this.clip = { A: A2, t0: this.t }; this.drawn = false; }
    stop() { this.clip = null; this.drawn = false; }
    appear() { this.present = true; this.play('arrivee'); }
    vanish() { this.present = false; this.play('depart'); }
    setMode(md) { if (md === this.mode) return; this.mPrev = this.mode; this.mode = md; this.mT0 = this.t; this.drawn = false; }
    baseNow() { return mix(this.bFrom, this.bTo, ss(cl((this.t - this.bT0) / .5, 0, 1))); }
    setAnchor(x, y, size, snap) { this.ax.to(x, snap); this.ay.to(y, snap); if (size) this.as.to(size, snap); this.drawn = false; }
    setTrack(a, b) { this.trk = [a, b == null ? a : b]; }
    set(o) { Object.assign(this.o, o); this.drawn = false; }
    dragTo(dx) { this.drag = dx; }
    release() { this.drag = null; }
    fly(o, cb) { this.flight = { x0: this.ax.v, y0: this.ay.v, s0: this.as.v, x1: o.x, y1: o.y, s1: o.size || this.as.v, cx: o.cx == null ? (this.ax.v + o.x) / 2 : o.cx, cy: o.cy == null ? (this.ay.v + o.y) / 2 : o.cy, d: o.d || .6, ex: o.ex || 'io', ey: o.ey || o.ex || 'io', es: o.es || 'io', t0: this.t, cb }; this.trk = o.track || [o.x, o.x]; this.off = 0; this.vel = 0; this.drawn = false; }
    destroy() { this.dead = true; STAGES.delete(this); if (this.sub) sens().listeners.delete(this.sub); if (this.io) this.io.disconnect(); if (this.svg.parentNode) this.svg.parentNode.removeChild(this.svg); }
    onSens(type) {
      if (this.dead || !this.o.motion || !this.present) return;
      if (type === 'flip') { this.sleepPrev = this.mode; this.setMode('sleep'); return; }
      if (type === 'unflip') { this.setMode(this.sleepPrev && this.sleepPrev !== 'sleep' ? this.sleepPrev : 'idle'); this.play('etirement'); return; }
      if (REDUCE || this.o.reduce || this.mode === 'read') return;
      if (type === 'shake') this.play('cachette'); else if (type === 'drop') this.play('surplace');
    }
    modeFrame(md, t, b) {
      const fr = Z(); fr.col = b;
      if (md === 'still') return fr;
      if (md === 'idle') { fr.y = -.035 * sin(TAU * t / 2.6); fr.wl = fr.wr = 7 * sin(TAU * t / 1.3); fr.ht = 1.4 * sin(TAU * t / 3.1); fr.rg = .12 * sin(TAU * t / 2.2); fr.ex = this.look[0]; fr.ey = this.look[1]; }
      else if (md === 'listen') { fr.y = -.02 * sin(TAU * t / 1.6); fr.wl = fr.wr = 16 + 4 * sin(TAU * t / .5); fr.hh = 3.5; fr.ht = 1.2 * sin(TAU * t / .8); fr.rg = .5 + .4 * sin(TAU * t / .6); fr.ey = -.35; fr.bl = fr.br = .5; fr.col = mix(b, L.cy, .45); fr.eg = .3; }
      else if (md === 'think') { fr.y = -.03 * sin(TAU * t / 2); fr.wl = fr.wr = 5 * sin(TAU * t / 1.1); fr.rg = -.45; for (let i = 0; i < 3; i++) { const q = ((t / 1.2 - i / 3) % 1 + 1) % 1; fr['r' + (i + 1)] = 1.3 * bell(q, .2, .2); } fr.ex = -.45; fr.ey = -.6; fr.col = mix(b, L.in, .2); }
      else if (md === 'read') { fr.wl = fr.wr = 3 * sin(TAU * t / 2.4); const q = (t % 2.8) / 2.8; fr.ex = -.55 + 1.1 * ss(min(1, q * 1.15)); fr.ey = .5; }
      else if (md === 'sleep') { fr.y = .05 - .02 * sin(TAU * t / 4.5); fr.wl = fr.wr = -26 + 2 * sin(TAU * t / 4.5); fr.ws = .82; fr.rg = -.65; fr.eyes = 'eteint'; fr.col = mix(b, L.c8, .4); }
      return fr;
    }
    tick(dt) {
      const o = this.o, red = REDUCE || o.reduce, sdt = dt * (o.speed || 1);
      this.t += sdt; const t = this.t;
      if (this.flight) { const fl = this.flight, q = cl((t - fl.t0) / fl.d, 0, 1), ex = EZ[fl.ex](q), ey = EZ[fl.ey](q), u = 1 - ex, v = 1 - ey; this.ax.to(u * u * fl.x0 + 2 * u * ex * fl.cx + ex * ex * fl.x1, true); this.ay.to(v * v * fl.y0 + 2 * v * ey * fl.cy + ey * ey * fl.y1, true); this.as.to(fl.s0 + (fl.s1 - fl.s0) * EZ[fl.es](q), true); if (q >= 1) { this.flight = null; if (fl.cb) { try { fl.cb(); } catch (x) { } } } }
      if (o.still && !this.clip && !this.flight && (this.drawn || !this.vis)) return;
      const ax = this.ax.step(sdt), ay = this.ay.step(sdt), S = max(4, this.as.step(sdt));
      if (this.mode === 'idle' && !o.still) { if (t > this.lookAt) { this.lookAt = t + 2.2 + Math.random() * 3; this.lookT = Math.random() < .4 ? [0, 0] : [(Math.random() - .5) * 1.4, (Math.random() - .5) * .8]; } const kk = 1 - exp(-sdt * 6); this.look[0] += (this.lookT[0] - this.look[0]) * kk; this.look[1] += (this.lookT[1] - this.look[1]) * kk; }
      const base = this.baseNow();
      let fr = this.modeFrame(o.still ? 'still' : this.mode, t, base);
      if (!o.still && t - this.mT0 < .5) fr = lerpF(this.modeFrame(this.mPrev, t, base), fr, ss((t - this.mT0) / .5));
      if (!this.clip && this.mode !== 'sleep' && !o.still && t >= this.blinkAt) { const ph = (t - this.blinkAt) / .15; if (ph >= 1) this.blinkAt = t + (Math.random() < .2 ? .25 : 2.2 + Math.random() * 3.5); else fr.blink = sin(PI * ph); }
      if (o.ambient && !this.clip && this.mode === 'idle' && this.present && !o.still && t > this.ambAt) { this.ambAt = t + 9 + Math.random() * 8; this.play(AMB[flo(Math.random() * AMB.length)]); }
      if (this.clip) {
        const A2 = this.clip.A, tc = t - this.clip.t0, p = tc / A2.d;
        if (p >= 1) { this.clip = null; this.snap = null; this.drawn = false; if (o.onEnd) { try { o.onEnd(A2.id); } catch (x) { } } }
        else { const cf = evalClip(A2, p, fr.col), w = A2.hard ? 1 : ss(cl(min(tc / .08, (A2.d - tc) / .08), 0, 1)); let f2 = compose(fr, cf, w); if (this.snap && tc < .16 && !A2.hard) f2 = lerpF(this.snap, f2, ss(tc / .16)); fr = f2; }
      }
      const SE = sens(); let gx = 0, gy = 0;
      if (!SE.face) { gx = sin(cl(SE.gamma || 0, -80, 80) * PI / 180); gy = sin(cl(SE.beta || 0, -80, 80) * PI / 180); }
      const phys = o.motion && !red && this.mode !== 'read' && !this.flight && !o.still;
      if (phys) { const lo = this.trk[0] - this.ax.t, hi = this.trk[1] - this.ax.t; const tg = this.drag != null ? cl(this.drag, lo - S * .5, hi + S * .5) : (gx >= 0 ? hi * min(1, gx * 1.8) : lo * min(1, -gx * 1.8)); const kk = this.drag != null ? 70 : 24, cc = 2 * sqrt(kk); this.vel += ((tg - this.off) * kk - this.vel * cc) * sdt; this.off += this.vel * sdt; const v = cl(this.vel / S, -8, 8); fr.r += cl(v * 3, -16, 16) + gx * 7; const fl2 = abs(v) * 2.5 * sin(t * 26); fr.wl += cl(v * 3, -18, 18) + fl2; fr.wr += cl(-v * 3, -18, 18) + fl2; if (o.follow) { fr.ex += gx * .9; fr.ey += (gy - .35) * .35; } }
      else { this.off += -this.off * (1 - exp(-sdt * 6)); this.vel *= exp(-sdt * 8); }
      if (red) { fr.x = 0; fr.y = 0; fr.r = 0; fr.pr = 0; fr.s = 1; fr.sx = 1; fr.sy = 1; }
      this.cur = fr;
      if (!this.vis) { this.hist.length = 0; return; }
      this.drawn = true;
      const kS = S / 114, X0 = ax + this.off + fr.x * S, Y0 = ay + fr.y * S, SX = fr.s * fr.sx * kS, SY = fr.s * fr.sy * kS, TYp = -57 * SY;
      const tf = 'translate(' + X0.toFixed(2) + ' ' + Y0.toFixed(2) + ')' + (abs(fr.pr) > .01 ? ' translate(0 ' + TYp.toFixed(2) + ') rotate(' + fr.pr.toFixed(2) + ') translate(0 ' + (-TYp).toFixed(2) + ')' : '') + ' rotate(' + fr.r.toFixed(2) + ') scale(' + (abs(SX) < .0005 ? .0005 : SX).toFixed(4) + ' ' + (abs(SY) < .0005 ? .0005 : SY).toFixed(4) + ')';
      this.charG.setAttribute('transform', tf);
      const op = (this.present || this.clip) ? cl(fr.op, 0, 1) : 0;
      this.charG.setAttribute('opacity', op.toFixed(3));
      this.bodyG.setAttribute('opacity', cl(fr.bop, 0, 1).toFixed(3));
      const ck = fr.col[0].toFixed(3) + fr.col[1].toFixed(3) + fr.col[2].toFixed(3);
      if (ck !== this.colKey) { this.colKey = ck; this.paintCol(fr.col); this.hcKey = ''; }
      const hk = fr.hc.toFixed(2); if (hk !== this.hcKey) { this.hcKey = hk; this.paintHood(fr.hc); }
      const ht = cl(fr.ht, -14, 14), hh = cl(fr.hh, -9, 10), tk = ht.toFixed(1) + ',' + hh.toFixed(1);
      if (tk !== this.lastTip) { this.lastTip = tk; this.hood.setAttribute('d', hoodD(ht, hh)); this.shade.setAttribute('d', shadeD(ht, hh)); }
      const ws = max(.2, fr.ws), front = fr.wf > .5, wgo = (.35 + .5 * cl(fr.wg, 0, 1.5)).toFixed(2);
      [this.wingsB, this.wingsF].forEach((set, si) => { const show = si === 0 ? !front : front; set[0].g.setAttribute('opacity', show ? '1' : '0'); set[1].g.setAttribute('opacity', show ? '1' : '0'); if (!show) return; set[0].g.setAttribute('transform', 'translate(-45 -15) rotate(' + fr.wl.toFixed(1) + ') scale(' + ws.toFixed(3) + ')'); set[1].g.setAttribute('transform', 'translate(45 -15) scale(-1 1) rotate(' + fr.wr.toFixed(1) + ') scale(' + ws.toFixed(3) + ')'); set[0].glow.setAttribute('opacity', wgo); set[1].glow.setAttribute('opacity', wgo); });
      const rv = [fr.r1, fr.r2, fr.r3], RP = [[-17 + ht * .18, -30], [ht * .35, -42 - hh * .25], [17 + ht * .18, -30]];
      this.runes.forEach((R2, i) => { const v = cl(.78 + fr.rg + rv[i], 0, 2); R2.main.setAttribute('opacity', cl(.25 + .75 * v, 0, 1).toFixed(3)); R2.glow.setAttribute('opacity', cl(.1 + .3 * v, 0, .8).toFixed(3)); R2.g.setAttribute('transform', 'translate(' + RP[i][0].toFixed(2) + ' ' + RP[i][1].toFixed(2) + ')' + (i === 1 ? ' rotate(' + fr.rr.toFixed(1) + ') scale(' + max(.2, fr.rs).toFixed(3) + ')' : '')); });
      const ex = cl(fr.ex, -1.2, 1.2), ey = cl(fr.ey, -1.2, 1.2);
      this.faceG.setAttribute('transform', 'translate(' + (ex * 2.2).toFixed(2) + ' ' + (ey * 1.6).toFixed(2) + ')');
      this.eyes.forEach(E2 => {
        const xp = expr(fr.eyes, E2.sd); if (xp[0] !== E2.type) this.buildEye(E2, xp[0]);
        const sc = cl(fr.es, .05, 2) * xp[1], bl = cl(fr.blink, 0, 1);
        E2.g.setAttribute('transform', 'translate(' + (E2.sd * 21) + ' 18) rotate(' + (-E2.sd * 6) + ') scale(' + sc.toFixed(3) + ' ' + (sc * (1 - .92 * bl)).toFixed(3) + ')');
        if (E2.pg) E2.pg.setAttribute('transform', 'translate(' + (ex * 2.3).toFixed(2) + ' ' + (ey * 2.2).toFixed(2) + ')');
        E2.lid.setAttribute('height', (cl(fr.lid, 0, 1) * 26).toFixed(2));
        E2.glow.setAttribute('opacity', cl(.45 + .55 * fr.eg, 0, 1).toFixed(3)); E2.glow.setAttribute('r', (17 + 5 * cl(fr.eg, 0, 1.5)).toFixed(1));
      });
      this.brows.forEach((b, i) => { const sd = i ? 1 : -1, raise = sd < 0 ? fr.bl : fr.br; b.setAttribute('transform', 'translate(' + (sd * 19) + ' ' + (-3 - raise * 3.6).toFixed(2) + ') scale(' + (sd < 0 ? 1 : -1) + ' 1) rotate(' + (fr.ba * 14).toFixed(1) + ')'); b.setAttribute('opacity', cl(fr.bo, 0, 1).toFixed(2)); });
      const acc = this.accStr;
      if (fr.ag > .01) { this.aura.setAttribute('cx', X0.toFixed(1)); this.aura.setAttribute('cy', (Y0 + S * .05).toFixed(1)); this.aura.setAttribute('r', (S * (.75 + .35 * min(1, fr.ag))).toFixed(1)); this.aura.setAttribute('opacity', (min(1, fr.ag) * .85 * op).toFixed(3)); this.auraOn = true; }
      else if (this.auraOn) { this.aura.setAttribute('opacity', '0'); this.auraOn = false; }
      this.hist.push(tf); if (this.hist.length > 16) this.hist.shift();
      const out = { f: [], b: [], o: [], x: [], g: [] };
      if (!red && fr.A && fr.A.x.length && op > .01) { const rr = fr.r * PI / 180, th = 57 + hh, TX = X0 + sin(rr) * th * SY + ht * SX * cos(rr), TY = Y0 - cos(rr) * th * SY; fr.A.x.forEach(q => { if (q.k !== 'trainee') fxp(q, fr.p, S, X0, Y0, ax + this.off, ay, TX, TY, out); }); }
      let gi = 0;
      out.g.forEach(g2 => { if (gi < 3) { const e = this.ghosts[gi++]; e.setAttribute('transform', 'translate(' + g2.dx.toFixed(1) + ' 0) ' + tf); e.setAttribute('fill', acc); e.setAttribute('opacity', (g2.op * op).toFixed(3)); e._on = true; } });
      const trail = !red && fr.A && fr.A.trail;
      if (trail) for (let i = 0; i < trail && gi < 3; i++) { const h2 = this.hist[this.hist.length - 1 - (i + 1) * 4]; if (!h2) break; const e = this.ghosts[gi++]; e.setAttribute('transform', h2); e.setAttribute('fill', acc); e.setAttribute('opacity', ((.28 - i * .08) * op).toFixed(2)); e._on = true; }
      for (; gi < 3; gi++) { const e = this.ghosts[gi]; if (e._on) { e.setAttribute('opacity', '0'); e._on = false; } }
      paintP(this.fPool, out.f, acc); paintP(this.bPool, out.b, acc); paintO(this.oPool, out.o, acc); paintX(this.xPool, out.x, acc);
    }
  }

  window.ESPRIT = { LIST, FAMS, BY, TAP, mount: (host, o) => new Stage(host, o), setReduce: v => { REDUCE = !!v; STAGES.forEach(s => { s.drawn = false; }); }, getReduce: () => REDUCE };
})();
