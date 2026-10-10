/* L’étoile de Mìmir : moteur d’animation, 156 animations, capteurs du téléphone. */
(function () {
  'use strict';
  const STAR = 'M625 252Q645 308 696 328Q645 348 625 404Q605 348 554 328Q605 308 625 252Z';
  const NS = 'http://www.w3.org/2000/svg';
  const PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, flo = Math.floor, sqrt = Math.sqrt;
  const cl = (v, a, b) => v < a ? a : v > b ? b : v;
  const seg = (p, a, b) => cl((p - a) / (b - a), 0, 1);
  const ss = t => t * t * (3 - 2 * t);
  const io = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const oc = t => 1 - Math.pow(1 - t, 3);
  const ob = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const oe = t => t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * sin((t * 10 - .75) * TAU / 3) + 1;
  const bo = t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) { t -= 1.5 / d; return n * t * t + .75; } if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + .9375; } t -= 2.625 / d; return n * t * t + .984375; };
  const EZ = { io, oc, ob, oe, bo, ss, lin: t => t };
  const env = (p, a, b) => ss(cl(min(p / (a || .12), (1 - p) / (b || .2)), 0, 1));
  const bell = (p, c, w) => { if (c == null) c = .5; if (w == null) w = .5; const u = (p - c) / w; return abs(u) >= 1 ? 0 : .5 + .5 * cos(PI * u); };
  const tri = t => { const f = t - flo(t); return f < .25 ? f * 4 : f < .75 ? 2 - f * 4 : f * 4 - 4; };
  const rnd = (i, k) => { const v = sin(i * 127.1 + k * 311.7 + 17.3) * 43758.5453; return v - flo(v); };

  /* ---------- couleurs (jetons Organic) ---------- */
  const HEX = { a1: '#fff2eb', a2: '#ffe1d0', a3: '#ffc6a5', a4: '#f6a06b', a5: '#d67f48', a6: '#b2622d', a7: '#8c491a', a8: '#643312', a9: '#402310', g1: '#f0fae1', g2: '#e1eecc', g3: '#ccdbb2', g4: '#aebf92', g5: '#8fa073', g6: '#728157', g7: '#56633f', g8: '#3d472b', g9: '#272e1b', n1: '#f9f4ed', n2: '#eee7db', n3: '#dcd3c4', n4: '#c0b6a5', n5: '#a19786', n6: '#82796a', n7: '#645c50', n8: '#474238', n9: '#2e2b25', a: '#c67139', g: '#7a8a5e', w: '#f5ead8', k: '#201e1d' };
  const VAR = k => k === 'a' ? '--color-accent' : k === 'g' ? '--color-accent-2' : k === 'w' ? '--color-bg' : k === 'k' ? '--color-text' : '--color-' + ({ a: 'accent', g: 'accent-2', n: 'neutral' })[k[0]] + '-' + k.slice(1) + '00';
  const toLin = c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
  const toS = c => { const v = c <= .0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - .055; return Math.round(cl(v, 0, 1) * 255); };
  function hexLab(h) { h = h.replace('#', ''); const r = toLin(parseInt(h.slice(0, 2), 16)), g = toLin(parseInt(h.slice(2, 4), 16)), b = toLin(parseInt(h.slice(4, 6), 16)); const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b); return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s]; }
  function labRgb(c) { const l_ = c[0] + .3963377774 * c[1] + .2158037573 * c[2], m_ = c[0] - .1055613458 * c[1] - .0638541728 * c[2], s_ = c[0] - .0894841775 * c[1] - 1.291485548 * c[2]; const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_; return 'rgb(' + toS(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s) + ',' + toS(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s) + ',' + toS(-.0041960863 * l - .7034186147 * m + 1.707614701 * s) + ')'; }
  const mix = (a, b, t) => t <= 0 ? a : t >= 1 ? b : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  let P = null, PR = null;
  function pal() { if (P) return P; P = {}; PR = {}; let cs = null; try { cs = getComputedStyle(document.documentElement); } catch (e) { } Object.keys(HEX).forEach(k => { let v = cs ? (cs.getPropertyValue(VAR(k)) || '').trim() : ''; if (!/^#[0-9a-f]{6}$/i.test(v)) v = HEX[k]; P[k] = hexLab(v); PR[k] = v; }); return P; }
  const RGB = k => (PR && PR[k]) || HEX[k] || HEX.a;

  /* ---------- pistes de mouvement (unités : hauteur de l’étoile) ---------- */
  const T = {
    hop: (h = 1, n = 1, a = 0, b = 1) => p => { const q = seg(p, a, b); if (q <= 0 || q >= 1) return {}; const k = q * n, f = k - flo(k), air = 4 * f * (1 - f), land = (1 - min(1, air * 4)) * min(1, q / .06, (1 - q) / .08); return { y: -h * air, sx: 1 + .09 * land, sy: 1 - .09 * land + .04 * air }; },
    hd: (h = 1, n = 3) => p => { const hs = [], ws = []; let tot = 0; for (let i = 0; i < n; i++) { const v = h * Math.pow(.45, i); hs.push(v); ws.push(sqrt(v)); tot += sqrt(v); } let acc = 0, i = 0; while (i < n - 1 && p > acc + ws[i] / tot) { acc += ws[i] / tot; i++; } const f = cl((p - acc) / (ws[i] / tot), 0, 1), air = 4 * f * (1 - f), land = (1 - min(1, air * 4)) * min(1, p / .05, (1 - p) / .06); return { y: -hs[i] * air, sx: 1 + .09 * land, sy: 1 - .09 * land }; },
    spin: (t = 1, e = 'io', a = 0, b = 1) => p => ({ r: 360 * t * EZ[e](seg(p, a, b)) }),
    wob: (a = 12, n = 3) => p => ({ r: a * sin(TAU * n * p) * env(p) }),
    shk: (a = .12, n = 8) => p => ({ x: a * sin(TAU * n * p) * env(p, .05, .15) }),
    nod: (a = .1, n = 2) => p => ({ y: a * sin(TAU * n * p) * env(p, .08, .12) }),
    pul: (a = .15, n = 1) => p => ({ s: 1 + a * Math.pow(sin(PI * n * p), 2) }),
    beat: (n = 2, a = .12) => p => { const f = p * n - flo(p * n); return { s: 1 + a * (bell(f, .22, .14) + .7 * bell(f, .5, .14)) }; },
    swg: (a = 18, n = 2) => p => ({ r: a * sin(TAU * n * p) * (1 - p) * min(1, p / .08) }),
    orb: (R = .6, t = 1, e = 'io') => p => { const q = EZ[e](p) * TAU * t; return { x: R * sin(q), y: -R * (1 - cos(q)) }; },
    f8: (rx = .5, ry = .25) => p => { const q = io(p) * TAU; return { x: rx * sin(q), y: ry * sin(2 * q) }; },
    zig: (a = .35, n = 2) => p => ({ x: a * tri(n * p) * env(p, .06, .1) }),
    flp: (n = 1, e = 'io', a = 0, b = 1) => p => ({ fy: cos(TAU * n * EZ[e](seg(p, a, b))) }),
    jel: (a = .09, n = 3) => p => { const v = a * sin(TAU * n * p) * env(p, .06, .2); return { sx: 1 + v, sy: 1 - v }; },
    grw: (a = .25, c = .5, w = .5) => p => ({ s: 1 + a * bell(p, c, w) }),
    pop: () => p => ({ s: p < .22 ? 1 - .3 * ss(p / .22) : p < .45 ? .7 + .48 * oc((p - .22) / .23) : 1.18 - .18 * io((p - .45) / .55) }),
    van: (c = .5, w = .35) => p => { const b = bell(p, c, w); return { op: 1 - b, s: 1 - .4 * b }; },
    tele: (dx = .9) => p => ({ op: 1 - max(bell(p, .25, .12), bell(p, .72, .12)), x: p > .25 && p < .72 ? dx : 0 }),
    rise: (h = .5, c = .5, w = .5) => p => ({ y: -h * bell(p, c, w) }),
    sink: (h = .2, c = .5, w = .5) => p => ({ y: h * bell(p, c, w) }),
    drift: (dx = .5, dy = 0, c = .5, w = .5) => p => { const b = bell(p, c, w); return { x: dx * b, y: dy * b }; },
    sway: (a = .25, n = 2) => p => { const v = sin(TAU * n * p) * env(p); return { x: a * v, r: -a * 40 * v }; },
    roll: (d = .8) => p => { const x = d * sin(PI * io(p)); return { x, r: x / .48 * 57.3 }; },
    tilt: (a = 15, c = .5, w = .5) => p => ({ r: a * bell(p, c, w) }),
    strch: (a = .1, c = .5, w = .5) => p => { const b = bell(p, c, w); return { sy: 1 + a * b, sx: 1 - a * .5 * b, y: -a * .4 * b }; },
    trem: (a = .03) => p => { const e = env(p, .08, .12); return { x: a * sin(p * 157) * e, y: a * sin(p * 211 + 1) * e }; },
    yoyo: (h = .7, n = 1) => p => ({ y: h * Math.pow(abs(sin(PI * n * p)), 1.3), r: 360 * n * io(p) }),
    boom: (d = 1.1) => p => ({ x: d * sin(PI * p), y: -.35 * sin(TAU * p), r: 720 * io(p) }),
    pp: (d = .5, n = 3) => p => ({ x: d * tri(n * p) * env(p, .04, .08) }),
    grav: (h = 2.2) => p => { if (p < .22) { const q = p / .22; return { y: -h * oc(q), op: 1 - ss(seg(q, .5, 1)) }; } if (p < .34) return { y: -h, op: 0 }; const q = (p - .34) / .66; return { y: -h * (1 - bo(q)), op: ss(seg(q, 0, .1)) }; },
    lk: kf => p => { let i = 0; while (i < kf.length - 2 && p > kf[i + 1][0]) i++; const a = kf[i], b = kf[i + 1], f = ss(seg(p, a[0], b[0])); return { ex: a[1] + (b[1] - a[1]) * f, ey: a[2] + (b[2] - a[2]) * f }; },
    knock: (n = 2) => p => { let x = 0; for (let i = 0; i < n; i++) x += bell(p, .2 + i * .22, .07); return { x: .12 * x }; },
    spring: (h = .4, n = 3) => p => { const v = sin(TAU * n * p) * (1 - p) * min(1, p / .05); return { y: -h * v, sx: 1 - .06 * v, sy: 1 + .06 * v }; },
    wall: (d = .6) => p => { const q = bell(p, .3, .07); return { x: p < .3 ? d * oc(p / .3) : d * (1 - oe((p - .3) / .7)), sx: 1 - .1 * q, sy: 1 + .05 * q }; },
    inflate: () => p => ({ s: p < .55 ? 1 + .3 * ss(p / .55) : 1.3 - .3 * oc((p - .55) / .45) }),
    land: () => p => { const v = .1 * Math.exp(-5 * p) * cos(18 * p) * (1 - p); return { sx: 1 + v, sy: 1 - v }; },
    hold: (dx = .5, dy = 0) => p => { const g = ss(seg(p, .08, .16)) * (1 - ss(seg(p, .82, .94))); return { x: dx * g, y: dy * g }; }
  };
  const E = (...a) => { if (a.length === 1) return a[0]; const o = [[0, a[0]]]; for (let i = 1; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; };
  const C = {
    to: (k, c = .5, w = .5, g = 0) => (p, Q, b) => { const e = bell(p, c, w); return { col: mix(b, Q[k], e), glow: g * e }; },
    hold: (k, g = 0) => (p, Q, b) => { const e = env(p, .15, .25); return { col: mix(b, Q[k], e), glow: g * e }; },
    fl: (k, at = .4, w = .12) => (p, Q, b) => ({ col: mix(b, Q[k], bell(p, at, w)) }),
    pu: (k, n = 2) => (p, Q, b) => ({ col: mix(b, Q[k], Math.pow(sin(PI * n * p), 2)) }),
    cy: (ks, n = 1, g = 0) => (p, Q, b) => { const L = ks.length, t = p * n * L, i = flo(t), f = t - i, c = mix(Q[ks[i % L]], Q[ks[(i + 1) % L]], ss(f)), e = env(p, .1, .2); return { col: mix(b, c, e), glow: g * e }; },
    gr: (k1, k2, t = 1, g = 0) => (p, Q, b) => { const e = env(p, .12, .2); return { grad: [mix(b, Q[k1], e), mix(b, Q[k2], e), 45 + 360 * t * p], glow: g * e }; }
  };
  const F = {
    b: (n = 8, sh = 'star', c = 'a3', d = 1.4, z = .3, at = .3, l = .45) => ({ k: 'b', n, sh, c, d, z, at, l }),
    cf: (n = 14, at = .2, l = .75) => ({ k: 'cf', n, at, l }),
    up: (n = 3, sh = 'heart', c = 'a4', at = .15, l = .7, z = .3) => ({ k: 'up', n, sh, c, at, l, z }),
    sky: (sh = 'drop', n = 8, c = 'g4', z = .22, dir = 0) => ({ k: 'sky', sh, n, c, z, dir }),
    orb: (n = 3, sh = 'dot', c = 'a3', r = .95, t = 1, z = .26) => ({ k: 'orb', n, sh, c, r, t, z }),
    ring: (c = 'a3', at = .2, l = .5, r = 1.8, w = .06) => ({ k: 'ring', c, at, l, r, w }),
    rays: (n = 8, c = 'a3', at = .25, l = .55, rot = 30) => ({ k: 'rays', n, c, at, l, rot }),
    tw: (n = 4, c = 'a3', z = .32) => ({ k: 'tw', n, c, z }),
    tx: (t = '?', c = 'a4', at = .2, l = .6) => ({ k: 'tx', t, c, at, l }),
    tr: (n = 3) => ({ k: 'tr', n }),
    arc: (n = 3, c = 'g4', side = 1) => ({ k: 'arc', n, c, side }),
    pr: (c = 'a3') => ({ k: 'pr', c }),
    bk: (sh = 'moon', c = 'w', z = .9, dx = .55, dy = -.35) => ({ k: 'bk', sh, c, z, dx, dy }),
    bolt: (at = .3) => ({ k: 'bolt', at }),
    ck: (c = 'g5', at = .35) => ({ k: 'ck', c, at }),
    fw: (n = 3) => ({ k: 'fw', n }),
    zz: (c = 'a4') => ({ k: 'zz', c }),
    din: (sh = 'arrow', c = 'a3', at = .05, l = .35) => ({ k: 'in', sh, c, at, l })
  };

  /* ---------- 156 animations ---------- */
  const LIST = [], BY = {};
  function A(fam, id, n, d, w, t, e, c, x) { const o = { fam, id, n, d: min(2.8, d), w, t: t || [], e: e || 'open', c: c || null, x: x || [], trail: 0, num: LIST.length + 1 }; o.x.forEach(f => { if (f.k === 'tr') o.trail = f.n; }); LIST.push(o); BY[id] = o; }

  A('accueil', 'salut', 'Salut', 1.6, 'On touche la barre', [T.hop(.35, 1, 0, .45), T.swg(14, 2)], E('open', .15, 'happy', .85, 'open'), null, [F.tw(3, 'a3')]);
  A('accueil', 'coucou', 'Coucou', 1.4, 'Mìmir sort de derrière la caméra', [T.drift(.35, 0, .45, .45), T.tilt(-16, .45, .45)], E('open', .3, 'wink', .7, 'open'));
  A('accueil', 'reverence', 'Révérence', 1.8, 'Premier lancement', [T.tilt(28, .5, .45), T.sink(.14, .5, .45)], E('open', .3, 'closed', .72, 'open'), C.to('a3', .5, .4), [F.tw(4, 'a3')]);
  A('accueil', 'clin', 'Clin d’œil', 1.2, 'Réponse complice', [T.pul(.06), T.tilt(10)], E('open', .3, 'wink', .72, 'open'));
  A('accueil', 'bienvenue', 'Bienvenue', 2.4, 'Après l’installation', [T.spin(1, 'ob'), T.grw(.22, .5, .45)], E('happy', .9, 'open'), C.to('a3', .5, .45, .6), [F.b(8, 'star', 'a3', 1.6, .3, .35, .5), F.ring('a3', .3, .55, 2)]);
  A('accueil', 'bonjour', 'Bonjour', 2.2, 'Premier déverrouillage du matin', [T.rise(.3, .5, .45), T.strch(.1, .5, .4)], E('sleepy', .3, 'open', .55, 'happy', .9, 'open'), C.to('a3', .55, .45, .5), [F.rays(8, 'a3', .3, .6)]);
  A('accueil', 'retour', 'Te revoilà', 1.6, 'Retour après une pause', [T.hd(.5, 3)], E('happy', .9, 'open'), null, [F.b(6, 'dot', 'a3', 1.2, .22, .08, .4)]);
  A('accueil', 'aurevoir', 'À bientôt', 1.8, 'On ferme la conversation', [T.swg(16, 2), T.drift(-.2, 0)], E('happy', .6, 'closed', .85, 'open'));
  A('accueil', 'bonnenuit', 'Bonne nuit', 2.6, 'Le soir, dernière demande', [T.sink(.1, .5, .45)], E('open', .25, 'sleepy', .45, 'closed', .92, 'open'), C.to('a3', .5, .45), [F.zz()]);
  A('accueil', 'timide', 'Salut timide', 1.6, 'Première conversation', [T.drift(-.16, 0), T.tilt(-12)], E('dot', .45, 'happy', .85, 'open'), C.fl('a6', .5, .25));
  A('accueil', 'loin', 'Salut de loin', 1.8, 'Message depuis une autre appli', [T.orb(.35, 1)], E('happy', .9, 'open'), null, [F.tr(3)]);
  A('accueil', 'ola', 'Ola', 2.0, 'Plusieurs messages d’un coup', [T.nod(.18, 3), T.wob(10, 3)], 'happy', C.cy(['a', 'a3', 'g4'], 1));
  A('accueil', 'reconnait', 'Je te reconnais', 1.5, 'Déverrouillage par le visage', [T.grw(.12, .5, .4)], E('open', .25, 'wide', .5, 'happy', .88, 'open'), C.fl('g5', .4, .2), [F.ring('g5', .2, .5, 1.7)]);

  A('joie', 'saut', 'Saut de joie', 1.4, 'Une tâche réussie', [T.hop(.9, 1, .08, .92), T.spin(1, 'io', .15, .8)], 'happy', null, [F.b(6, 'star', 'a3', 1.4, .3, .5, .4)]);
  A('joie', 'double', 'Double saut', 1.4, 'Deux bonnes nouvelles', [T.hop(.6, 2)], 'happy', C.fl('a3', .5, .2));
  A('joie', 'pirouette', 'Pirouette', 1.6, 'Une réponse éclair', [T.spin(2, 'io'), T.grw(.1)], 'happy', null, [F.tr(3)]);
  A('joie', 'hourra', 'Hourra', 1.8, 'Objectif atteint', [T.hop(.7, 1, .05, .6), T.jel(.08, 3)], E('wide', .2, 'happy'), null, [F.cf(14, .25, .7)]);
  A('joie', 'bravo', 'Bravo', 1.6, 'Une série terminée', [T.pul(.12, 3)], 'happy', C.pu('a3', 3), [F.tw(5, 'a3')]);
  A('joie', 'confettis', 'Confettis', 2.4, 'Une semaine sans oubli', [T.grw(.16, .25, .25), T.hop(.3, 1, .15, .45)], E('wide', .2, 'happy'), null, [F.cf(18, .18, .8)]);
  A('joie', 'artifice', 'Feu d’artifice', 2.6, 'Un grand moment', [T.rise(.35, .5, .45)], E('wide', .3, 'happy'), C.fl('w', .32, .08), [F.fw(3)]);
  A('joie', 'merci', 'Merci', 1.8, 'On remercie Mìmir', [T.beat(2)], 'heart', C.to('a4', .5, .45), [F.up(3, 'heart', 'a4', .1, .75)]);
  A('joie', 'fier', 'Fier', 1.8, 'Il a bien répondu', [T.strch(.1, .5, .45), T.rise(.14, .5, .45)], E('open', .2, 'cool', .82, 'open'), null, [F.rays(6, 'a3', .3, .5)]);
  A('joie', 'danse', 'Danse', 2.4, 'Musique joyeuse', [T.sway(.28, 2), T.hop(.22, 4)], 'happy', C.cy(['a', 'a3', 'g5'], 1));
  A('joie', 'filante', 'Étoile filante', 1.8, 'Un souhait exaucé', [T.drift(1.1, -.55, .45, .45), T.tilt(-25, .45, .45)], E('wide', .3, 'happy', .85, 'open'), C.to('a3', .45, .4, .5), [F.tr(3), F.tw(3, 'w')]);
  A('joie', 'victoire', 'Victoire', 2.2, 'Premier défi relevé', [T.hop(1, 1, .05, .65), T.spin(1, 'io', .1, .6)], 'happy', C.to('a3', .4, .4, .8), [F.b(10, 'star', 'a3', 1.8, .3, .35, .5), F.ring('a3', .35, .5, 2.2)]);
  A('joie', 'rire', 'Fou rire', 1.6, 'Une blague', [T.shk(.06, 10), T.nod(.06, 6), T.jel(.06, 5)], 'happy');

  A('reflexion', 'reflechit', 'Réfléchit', 2.4, 'Préparation d’une réponse', [T.wob(6, 2)], 'up', C.pu('a3', 2), [F.orb(3, 'dot', 'a3', 1, 1)]);
  A('reflexion', 'hmm', 'Hmm…', 1.8, 'Une question difficile', [T.tilt(14, .5, .45), T.lk([[0, 0, 0], [.25, .6, -.6], [.8, .6, -.6], [1, 0, 0]])], 'open', null, [F.tx('…', 'a4', .2, .7)]);
  A('reflexion', 'cherche', 'Cherche', 2.4, 'Recherche dans la bibliothèque', [T.zig(.32, 2), T.lk([[0, 0, 0], [.2, -.8, 0], [.45, .8, 0], [.7, -.8, 0], [.9, .8, 0], [1, 0, 0]])], 'open', null, [F.ring('g4', .1, .5, 1.6), F.ring('g4', .5, .45, 1.6)]);
  A('reflexion', 'calcule', 'Calcule', 2.0, 'Un calcul', [T.spin(1, 'lin'), T.pul(.06, 4)], 'small', C.pu('g5', 2), [F.orb(4, 'spark', 'a3', 1.05, -1)]);
  A('reflexion', 'orbite', 'Orbite', 2.4, 'Une réponse longue', [T.orb(.45, 1)], 'up', null, [F.tr(2)]);
  A('reflexion', 'pendule', 'Pendule', 2.4, 'Attente d’un résultat', [T.swg(24, 2), T.lk([[0, 0, 0], [.25, .7, 0], [.5, -.7, 0], [.75, .5, 0], [1, 0, 0]])]);
  A('reflexion', 'lit', 'Lit un document', 2.6, 'Analyse d’un PDF', [T.nod(.03, 4), T.lk([[0, -.7, .5], [.24, .7, .5], [.26, -.7, .7], [.5, .7, .7], [.52, -.7, .9], [.76, .7, .9], [1, 0, 0]])], 'down', C.to('a3', .5, .5));
  A('reflexion', 'scanne', 'Scanne', 2.2, 'Lecture de l’écran à la demande', [T.grw(.06)], 'wide', C.cy(['g5', 'g3'], 2), [F.ring('g5', .05, .45, 1.9, .04), F.ring('g5', .35, .45, 1.9, .04), F.ring('g5', .65, .33, 1.9, .04)]);
  A('reflexion', 'eureka', 'Eurêka', 1.6, 'Il a trouvé', [T.rise(.35, .42, .38), T.grw(.25, .42, .3)], E('wide', .3, 'happy', .85, 'open'), C.fl('w', .4, .12), [F.tx('!', 'a4', .25, .6), F.rays(8, 'a3', .3, .5)]);
  A('reflexion', 'concentre', 'Concentration', 2.4, 'Une tâche complexe', [T.trem(.02), T.pul(.05, 2)], 'closed', C.gr('a3', 'a7', 1));
  A('reflexion', 'patience', 'Patience', 2.6, 'Une réponse qui prend du temps', [T.spin(1, 'io', .1, .9), T.sink(.06)], E('up', .4, 'sleepy', .6, 'up'));
  A('reflexion', 'feuillette', 'Feuillette', 2.0, 'Parcourt plusieurs sources', [T.flp(2)], 'open', null, [F.tw(2, 'a3')]);
  A('reflexion', 'relie', 'Relie les idées', 2.6, 'Fait une synthèse', [T.f8(.5, .25)], 'up', C.cy(['a', 'g5'], 1), [F.tr(3), F.tw(3, 'g4')]);

  A('ecoute', 'ecoute', 'Écoute', 2.2, 'On dit « Salut Mìmir »', [T.nod(.05, 4)], 'up', C.hold('g5'), [F.arc(3, 'g4', 1)]);
  A('ecoute', 'oreille', 'Tend l’oreille', 1.8, 'Une voix lointaine', [T.tilt(-20, .5, .45), T.drift(-.15, 0)], 'wide', null, [F.arc(2, 'g4', -1)]);
  A('ecoute', 'hoche', 'Hoche la tête', 1.6, 'Il a compris', [T.nod(.12, 3)], 'happy');
  A('ecoute', 'rythme', 'Suit le rythme', 2.4, 'Musique en cours', [T.hop(.18, 4), T.wob(8, 4)], 'happy', null, [F.up(3, 'note', 'g4', .1, .8)]);
  A('ecoute', 'onde', 'Onde vocale', 2.0, 'Vous parlez', [T.pul(.1, 6)], 'open', C.pu('g5', 3), [F.ring('g4', .1, .4, 1.6, .04), F.ring('g4', .5, .4, 1.6, .04)]);
  A('ecoute', 'attentif', 'Attentif', 2.0, 'Une longue phrase', [T.grw(.08), T.lk([[0, 0, 0], [.2, 0, -.6], [.8, 0, -.6], [1, 0, 0]])], 'wide', C.to('g4', .5, .5));
  A('ecoute', 'murmure', 'Murmure', 2.2, 'Mode chuchoté', [T.sink(.08)], 'sleepy', C.to('g3', .5, .5), [F.arc(2, 'g3', 1)]);
  A('ecoute', 'compris', 'Compris !', 1.4, 'La demande est claire', [T.pop()], 'happy', C.fl('g5', .45, .2), [F.ck('g5', .3)]);
  A('ecoute', 'pardon', 'Pardon ?', 1.8, 'Il n’a pas bien entendu', [T.tilt(20, .5, .45)], 'q', null, [F.tx('?', 'g4', .2, .65)]);
  A('ecoute', 'notes', 'Prend des notes', 2.4, 'Dictée', [T.nod(.03, 8), T.lk([[0, -.6, .6], [.3, .6, .6], [.32, -.6, .8], [.62, .6, .8], [.64, -.6, 1], [.94, .6, 1], [1, 0, 0]])], 'down', C.to('g5', .5, .5));
  A('ecoute', 'traduit', 'Traduit', 2.4, 'Traduction en direct', [T.flp(1, 'io', .2, .8)], 'open', C.cy(['g5', 'a', 'g5'], 1), [F.arc(2, 'g4', 1), F.arc(2, 'a3', -1)]);
  A('ecoute', 'fort', 'Plus fort ?', 1.6, 'Voix trop faible', [T.grw(.18, .35, .25), T.shk(.04, 6)], 'wide', null, [F.ring('g4', .2, .5, 1.8)]);
  A('ecoute', 'fin', 'Fin d’écoute', 1.6, 'Vous avez fini de parler', [T.sink(.1)], E('closed', .6, 'open'), C.to('g5', .3, .4));

  A('alerte', 'message', 'Nouveau message', 1.6, 'Un message arrive', [T.hop(.4, 1, 0, .5), T.wob(10, 2)], E('wide', .3, 'open'), C.fl('a3', .3, .15), [F.ring('a3', .1, .5, 1.8)]);
  A('alerte', 'rappel', 'Rappel', 2.0, 'Un rappel sonne', [T.swg(20, 3)], 'wide', null, [F.arc(2, 'a3', 1), F.arc(2, 'a3', -1)]);
  A('alerte', 'toc', 'Toc toc', 1.4, 'Quelqu’un veut vous joindre', [T.knock(2)], 'open', null, [F.ring('a3', .15, .25, 1.3, .05), F.ring('a3', .37, .25, 1.3, .05)]);
  A('alerte', 'appel', 'Appel entrant', 2.6, 'Le téléphone sonne', [T.trem(.035), T.pul(.08, 4)], 'wide', C.pu('g5', 4), [F.ring('g5', .05, .4, 1.9), F.ring('g5', .35, .4, 1.9), F.ring('g5', .62, .36, 1.9)]);
  A('alerte', 'colis', 'Colis livré', 2.0, 'Une livraison', [T.hd(.6, 3)], 'happy', null, [F.ck('g5', .45)]);
  A('alerte', 'mail', 'E-mail important', 1.8, 'Expéditeur prioritaire', [T.rise(.2, .4, .4), T.flp(1, 'io', .2, .6)], 'open', null, [F.tx('!', 'a4', .5, .45)]);
  A('alerte', 'rdv', 'Rendez-vous', 2.2, 'Dans 10 minutes', [T.orb(.3, 1)], E('open', .4, 'up'), null, [F.pr('a3')]);
  A('alerte', 'minuteur', 'Minuteur fini', 2.2, 'Le minuteur sonne', [T.shk(.1, 12)], 'wide', C.pu('a6', 3), [F.rays(8, 'a4', .1, .7, 60)]);
  A('alerte', 'mention', 'On parle de vous', 1.6, 'Une mention', [T.tilt(-15)], E('open', .3, 'wink', .75, 'open'), null, [F.tx('@', 'a4', .2, .6)]);
  A('alerte', 'discret', 'Rappel discret', 2.0, 'Mode concentration', [T.grw(.05)], 'open', C.pu('a3', 1));
  A('alerte', 'important', 'Important', 1.6, 'Une alerte à lire', [T.pul(.16, 2)], 'wide', C.fl('a7', .3, .15), [F.ring('a6', .2, .5, 1.9)]);
  A('alerte', 'fichier', 'Fichier reçu', 1.8, 'Un fichier partagé', [T.sink(.12, .42, .2), T.pop()], 'open', null, [F.din('arrow', 'a3')]);
  A('alerte', 'souvenir', 'Souvenir du jour', 2.2, 'Une photo d’il y a un an', [T.grw(.08)], 'shine', C.fl('w', .35, .1), [F.tw(6, 'w')]);

  A('emotion', 'surpris', 'Surpris', 1.2, 'Une info inattendue', [T.pop()], E('open', .15, 'wide', .8, 'open'), null, [F.tx('!', 'a4', .15, .6)]);
  A('emotion', 'rougit', 'Rougit', 1.8, 'Un compliment', [T.tilt(-10), T.drift(-.1, 0)], 'happy', C.to('a6', .5, .45));
  A('emotion', 'triste', 'Un peu triste', 2.4, 'Une mauvaise nouvelle', [T.sink(.15), T.tilt(-8)], E('sad', .3, 'tear', .85, 'open'), C.to('g6', .5, .45));
  A('emotion', 'grognon', 'Grognon', 1.6, 'On lui parle mal', [T.trem(.04), T.shk(.04, 4)], 'angry', C.to('a7', .5, .45));
  A('emotion', 'amoureux', 'Amoureux', 2.2, 'Un message très gentil', [T.beat(3)], 'heart', C.to('a4', .5, .5), [F.up(4, 'heart', 'a4', .05, .8)]);
  A('emotion', 'gene', 'Gêné', 1.8, 'Il s’est trompé', [T.sway(.08, 2)], 'sweat', C.fl('a6', .5, .3));
  A('emotion', 'confus', 'Confus', 2.0, 'Une demande ambiguë', [T.wob(14, 2)], 'q', null, [F.tx('?', 'a4', .15, .7)]);
  A('emotion', 'emu', 'Ému', 2.2, 'Un beau souvenir', [T.grw(.06)], 'shine', C.to('a3', .5, .5), [F.tw(4, 'a3')]);
  A('emotion', 'malicieux', 'Malicieux', 1.8, 'Il a une idée', [T.tilt(12), T.lk([[0, 0, 0], [.3, .7, -.2], [.8, .7, -.2], [1, 0, 0]])], E('open', .3, 'wink', .7, 'open'), null, [F.tw(1, 'a3')]);
  A('emotion', 'reveur', 'Rêveur', 2.6, 'Fin de journée', [T.rise(.2), T.sway(.12, 1)], 'sleepy', null, [F.up(3, 'dot', 'g3', .1, .8, .2)]);
  A('emotion', 'ennui', 'S’ennuie', 2.6, 'Rien depuis longtemps', [T.wob(5, 1), T.lk([[0, 0, 0], [.3, -.6, .3], [.7, .6, .3], [1, 0, 0]])], 'sleepy');
  A('emotion', 'determine', 'Déterminé', 1.6, 'Une tâche difficile acceptée', [T.strch(.08), T.nod(.05, 1)], 'small', C.to('a6', .5, .5));
  A('emotion', 'soulage', 'Soulagé', 2.0, 'Problème réglé', [T.sink(.1, .35, .3), T.rise(.08, .75, .25)], E('closed', .6, 'happy'), null, [F.b(4, 'dot', 'n3', .9, .2, .3, .4)]);

  A('physique', 'roule', 'Roule', 2.0, 'Téléphone penché', [T.roll(.9), T.lk([[0, 0, 0], [.25, .8, 0], [.75, -.8, 0], [1, 0, 0]])]);
  A('physique', 'rebondit', 'Rebondit', 1.8, 'Petite chute', [T.hd(1, 4)]);
  A('physique', 'ressort', 'Ressort', 1.6, 'On tire sur la barre', [T.spring(.4, 3)]);
  A('physique', 'gelee', 'Gelée', 1.8, 'Une pichenette', [T.jel(.09, 5), T.wob(6, 5)], 'happy');
  A('physique', 'toupie', 'Toupie', 2.0, 'Lancée du doigt', [T.spin(3, 'oc'), T.wob(8, 6)], E('spiral', .8, 'open'), null, [F.tr(3)]);
  A('physique', 'tombe', 'Tombe du ciel', 2.2, 'L’écran se rallume', [T.grav(2.2)], E('wide', .6, 'happy'));
  A('physique', 'glisse', 'Glisse', 1.8, 'Glissée du doigt', [T.drift(.8, 0, .5, .5), T.tilt(-12, .5, .5)], 'open', null, [F.tr(3)]);
  A('physique', 'vertige', 'Vertige', 2.6, 'On secoue le téléphone', [T.spin(2, 'oc', 0, .6), T.wob(10, 3)], E('spiral', .85, 'open'), null, [F.orb(3, 'star', 'a3', .95, 2)]);
  A('physique', 'accroche', 'S’accroche', 2.0, 'Téléphone très penché', [T.tilt(-28, .5, .45), T.drift(-.2, 0), T.trem(.02)], 'wide');
  A('physique', 'apesanteur', 'Apesanteur', 2.6, 'Chute libre détectée', [T.rise(.5), T.spin(1, 'io')], 'wide', null, [F.tw(4, 'w')]);
  A('physique', 'boussole', 'Boussole', 2.4, 'Cherche le nord', [T.swg(32, 2)]);
  A('physique', 'equilibre', 'Équilibriste', 2.4, 'Posé de travers', [T.wob(18, 2), T.sway(.14, 2)], 'small');
  A('physique', 'bord', 'Rebond de bord', 1.4, 'Touche la caméra', [T.wall(.6)], E('open', .27, 'x', .45, 'open'), null, [F.b(5, 'dot', 'a3', .9, .2, .3, .3)]);

  A('couleur', 'arc', 'Arc-en-ciel chaud', 2.6, 'Mode créatif', [T.spin(1, 'io')], 'happy', C.cy(['a3', 'a', 'a7', 'g6', 'g4', 'a2'], 1, .4));
  A('couleur', 'braise', 'Braise', 2.2, 'Mode sombre', [T.trem(.015)], 'open', C.cy(['a7', 'a', 'a4'], 2, .6), [F.up(4, 'spark', 'a4', .05, .8, .2)]);
  A('couleur', 'sauge', 'Sauge', 2.0, 'Tout va bien', [T.grw(.06)], 'happy', C.hold('g5'));
  A('couleur', 'aube', 'Aube', 2.4, 'Réveil en douceur', [T.rise(.1)], E('sleepy', .4, 'open'), C.gr('a3', 'g4', 1, .4), [F.rays(6, 'a3', .2, .7)]);
  A('couleur', 'crepuscule', 'Crépuscule', 2.6, 'Le soir tombe', [T.sink(.08)], E('open', .5, 'sleepy', .9, 'open'), C.gr('a7', 'g7', 1));
  A('couleur', 'nuit', 'Nuit étoilée', 2.6, 'Après 22 h', [T.grw(.05)], 'open', C.hold('n8', .4), [F.tw(6, 'w')]);
  A('couleur', 'cameleon', 'Caméléon', 2.4, 'Change de fond', [T.lk([[0, 0, 0], [.3, -.7, 0], [.6, .7, 0], [1, 0, 0]])], 'happy', C.cy(['g5', 'a', 'g3', 'a7'], 2));
  A('couleur', 'degrade', 'Dégradé tournant', 2.4, 'Chargement d’un thème', [T.spin(1, 'io')], 'open', C.gr('a', 'g5', 2));
  A('couleur', 'clignote', 'Clignote', 1.6, 'Attire l’attention', [], E('open', .2, 'closed', .3, 'open', .5, 'closed', .6, 'open'), C.pu('w', 3));
  A('couleur', 'lueur', 'Lueur', 2.4, 'Une réponse prête', [T.grw(.1)], 'open', C.to('a3', .5, .5, 1));
  A('couleur', 'prisme', 'Prisme', 2.2, 'Analyse d’une image', [T.flp(1)], 'open', C.cy(['w', 'a3', 'g4', 'a'], 1), [F.rays(8, ['a3', 'g4', 'w'], .3, .5)]);
  A('couleur', 'flamme', 'Flamme', 2.4, 'Très motivé', [T.strch(.08), T.wob(4, 6)], 'small', C.cy(['a', 'a7', 'a4'], 3, .6), [F.up(4, 'spark', 'a4', .05, .8, .18)]);
  A('couleur', 'cendre', 'Cendre', 2.4, 'Économie d’énergie', [T.sink(.05)], 'sleepy', C.hold('n5'));

  A('systeme', 'batterie', 'Batterie faible', 2.4, 'Moins de 10 %', [T.sink(.12), T.tilt(-10)], 'sleepy', C.hold('a7'));
  A('systeme', 'charge', 'En charge', 2.4, 'Câble branché', [T.grw(.06)], 'happy', C.pu('g5', 2), [F.pr('g5'), F.up(2, 'bolt', 'g4', .2, .6, .3)]);
  A('systeme', 'plein', 'Chargé à 100 %', 1.8, 'Batterie pleine', [T.pop()], 'happy', C.fl('g5', .45, .25), [F.ring('g5', .3, .5, 1.9), F.b(6, 'dot', 'g4', 1.3, .2, .35, .4)]);
  A('systeme', 'horsligne', 'Hors ligne', 2.2, 'Pas de réseau, tout marche quand même', [T.wob(6, 1)], E('small', .6, 'happy'), C.to('n5', .35, .35), [F.tx('…', 'n4', .1, .5)]);
  A('systeme', 'connecte', 'Connecté', 1.6, 'Réseau retrouvé', [T.grw(.08)], 'happy', null, [F.ring('g5', .1, .45, 1.6), F.ring('g5', .4, .45, 1.6)]);
  A('systeme', 'telecharge', 'Téléchargement', 2.6, 'Un nouveau modèle arrive', [T.nod(.03, 3)], 'down', null, [F.pr('a3'), F.din('arrow', 'a3', .1, .3)]);
  A('systeme', 'termine', 'Terminé', 1.6, 'Tâche finie', [T.hop(.4, 1, 0, .6)], 'happy', C.fl('g5', .4, .2), [F.ck('g5', .25)]);
  A('systeme', 'erreur', 'Oups, erreur', 1.6, 'Quelque chose a échoué', [T.shk(.12, 6)], E('x', .8, 'open'), C.fl('a7', .3, .2));
  A('systeme', 'maj', 'Mise à jour', 2.6, 'Nouvelle version installée', [T.spin(1, 'io')], 'open', C.gr('a', 'g5', 1), [F.orb(2, 'spark', 'g4', 1.05, 2)]);
  A('systeme', 'silence', 'Mode silencieux', 1.8, 'Sonnerie coupée', [T.sink(.08)], E('closed', .75, 'open'), C.to('n4', .5, .45), [F.tx('chut', 'n5', .15, .6)]);
  A('systeme', 'nepasderanger', 'Ne pas déranger', 2.2, 'Concentration activée', [T.grw(.04)], 'sleepy', C.hold('g7'), [F.bk('moon', 'g4', .8, .6, -.5)]);
  A('systeme', 'verrouille', 'Verrouillé', 1.4, 'Écran verrouillé', [T.grw(-.12, .5, .45)], E('closed', .85, 'open'), C.to('n6', .5, .45));
  A('systeme', 'deverrouille', 'Déverrouillé', 1.4, 'Écran déverrouillé', [T.pop()], 'happy', null, [F.ring('a3', .3, .5, 1.8)]);

  A('moment', 'lever', 'Lever du soleil', 2.6, '7 h du matin', [T.rise(.35)], E('sleepy', .35, 'open'), C.gr('a3', 'a', 1, .5), [F.rays(10, 'a3', .15, .75, 40)]);
  A('moment', 'midi', 'Bon appétit', 2.0, 'Midi', [T.hop(.25, 2)], 'happy', null, [F.b(6, 'dot', 'a3', 1.2, .2, .3, .4)]);
  A('moment', 'coucher', 'Coucher du soleil', 2.6, '19 h', [T.sink(.3)], E('open', .4, 'sleepy', .85, 'open'), C.gr('a7', 'a3', 1));
  A('moment', 'minuit', 'Minuit', 2.4, 'Le jour change', [T.grw(.05)], 'open', C.hold('n8', .3), [F.bk('moon', 'w', .9, .6, -.45), F.tw(4, 'w')]);
  A('moment', 'pluie', 'Pluie', 2.4, 'Prévision : averses', [T.sink(.06)], 'up', C.to('g6', .5, .5), [F.bk('cloud', 'n3', 1, -.1, -1.1), F.sky('drop', 8, 'g4')]);
  A('moment', 'neige', 'Neige', 2.6, 'Prévision : neige', [T.trem(.02)], 'small', C.to('n2', .5, .5), [F.sky('flake', 8, 'w', .18)]);
  A('moment', 'orage', 'Orage', 2.0, 'Alerte météo', [T.shk(.05, 6)], 'wide', C.fl('w', .3, .06), [F.bolt(.28), F.bk('cloud', 'n5', 1, -.2, -1.1)]);
  A('moment', 'vent', 'Grand vent', 2.2, 'Rafales annoncées', [T.drift(-.3, 0), T.tilt(-20)], 'closed', null, [F.sky('leaf', 6, 'g5', .24, -1)]);
  A('moment', 'apres', 'Après la pluie', 2.4, 'Le soleil revient', [T.hop(.2, 1)], 'happy', C.cy(['g4', 'a3', 'a'], 1), [F.b(6, 'drop', 'g4', 1.2, .2, .2, .5)]);
  A('moment', 'anniv', 'Anniversaire', 2.8, 'Le jour J', [T.hop(.45, 2)], 'happy', null, [F.up(3, 'balloon', ['a', 'g5', 'a3'], .05, .85, .7), F.cf(12, .3, .65)]);
  A('moment', 'nouvelan', 'Bonne année', 2.8, '1er janvier', [T.spin(1, 'io', .1, .6)], 'happy', C.cy(['a3', 'g4', 'w'], 1), [F.fw(3)]);
  A('moment', 'lune', 'Pleine lune', 2.4, 'Nuit claire', [T.grw(.05)], 'shine', C.to('w', .5, .5, .6), [F.bk('moon', 'n2', .9, -.6, -.45)]);
  A('moment', 'chaleur', 'Chaleur', 2.2, 'Plus de 30 °C', [T.trem(.02), T.sink(.06)], 'sweat', C.to('a6', .5, .5), [F.rays(8, 'a4', .1, .8, 20)]);

  A('jeu', 'cache', 'Cache-cache', 2.4, 'Mode enfant', [T.van(.45, .3), T.drift(.3, 0, .45, .3)], E('open', .6, 'wink', .8, 'open'));
  A('jeu', 'jongle', 'Jongle', 2.4, 'En attendant', [T.hop(.35, 3)], 'up', null, [F.orb(3, 'dot', ['a3', 'g4', 'w'], .9, 2, .3)]);
  A('jeu', 'pingpong', 'Ping-pong', 2.2, 'Jeu de rythme', [T.pp(.45, 3), T.lk([[0, 0, 0], [.12, .8, 0], [.37, -.8, 0], [.62, .8, 0], [.87, -.8, 0], [1, 0, 0]])]);
  A('jeu', 'boomerang', 'Boomerang', 2.2, 'Renvoie une réponse', [T.boom(1)], E('wide', .8, 'happy'), null, [F.tr(3)]);
  A('jeu', 'yoyo', 'Yo-yo', 2.0, 'Petite pause', [T.yoyo(.7, 1)]);
  A('jeu', 'mouton', 'Saute-mouton', 2.0, 'Passe au suivant', [T.hop(.55, 2), T.zig(.25, 1)], 'happy');
  A('jeu', 'ballon', 'Ballon', 2.4, 'Gonfle et s’envole', [T.inflate(), T.spin(2, 'oc', .55, 1), T.drift(.25, -.4, .78, .22)], E('wide', .55, 'spiral', .9, 'open'));
  A('jeu', 'magie', 'Abracadabra', 2.4, 'Une surprise', [T.van(.45, .25)], E('closed', .65, 'happy'), null, [F.b(8, 'star', 'a3', 1.3, .3, .25, .4), F.b(8, 'star', 'g4', 1.3, .3, .6, .35)]);
  A('jeu', 'teleporte', 'Téléportation', 2.0, 'Change de place', [T.tele(.9)], 'open', null, [F.ring('g5', .15, .25, 1.3), F.ring('g5', .62, .25, 1.3)]);
  A('jeu', 'echo', 'Écho', 2.2, 'Répète après vous', [T.zig(.3, 2)], 'open', C.cy(['a', 'g5'], 2), [F.tr(3)]);
  A('jeu', 'roulade', 'Roulade', 1.8, 'Fait le malin', [T.hop(.4, 1), T.spin(1, 'io'), T.drift(.3, 0)], 'happy');
  A('jeu', 'soleil', '1, 2, 3, soleil', 2.6, 'Mini-jeu', [T.hold(.5, 0)], E('open', .12, 'wide', .85, 'open'));
  A('jeu', 'selfie', 'Coucou caméra', 2.0, 'Prise de selfie', [T.drift(.5, -.1, .5, .4)], E('wide', .4, 'happy', .85, 'open'), C.fl('w', .5, .06), [F.tw(4, 'w')]);

  A('repos', 'respire', 'Respire', 2.8, 'Rien à faire', [T.grw(.06), T.rise(.05)], E('open', .4, 'closed', .65, 'open'));
  A('repos', 'somnole', 'Somnole', 2.8, 'Tard le soir', [T.sink(.1, .45, .4), T.rise(.08, .8, .12)], E('sleepy', .3, 'closed', .72, 'wide', .9, 'open'));
  A('repos', 'baille', 'Bâille', 2.2, 'Un long moment sans rien', [T.strch(.12, .45, .4)], E('closed', .75, 'open'), C.to('a3', .45, .4));
  A('repos', 'regarde', 'Regarde autour', 2.6, 'Curieux', [T.lk([[0, 0, 0], [.2, -.8, 0], [.45, -.8, 0], [.6, .8, -.2], [.85, .8, -.2], [1, 0, 0]]), T.tilt(-8, .3, .25), T.tilt(8, .72, .25)]);
  A('repos', 'etire', 'S’étire', 2.4, 'Après une longue pause', [T.strch(.12, .4, .35), T.wob(8, 1)], E('closed', .8, 'open'));
  A('repos', 'cligne', 'Cligne des yeux', 1.0, 'Toutes les quelques secondes', [], E('open', .3, 'closed', .42, 'open', .56, 'closed', .68, 'open'));
  A('repos', 'siffle', 'Sifflote', 2.6, 'Tout va bien', [T.sway(.1, 2)], 'happy', null, [F.up(3, 'note', 'a3', .1, .8, .3)]);
  A('repos', 'attend', 'Attend', 2.6, 'Vous tapez un message', [T.hd(.12, 3)], 'up');
  A('repos', 'reve', 'Rêve', 2.8, 'Pendant la nuit', [T.rise(.05)], 'closed', C.to('a3', .5, .5), [F.up(3, 'dot', 'n2', .1, .8, .18), F.zz()]);
  A('repos', 'flotte', 'Flotte', 2.6, 'Écran d’accueil', [T.f8(.12, .06)]);
  A('repos', 'scintille', 'Scintille', 1.8, 'De temps en temps', [], 'open', C.fl('w', .5, .15), [F.tw(4, 'w')]);
  A('repos', 'tour', 'Petit tour', 2.0, 'Pour le plaisir', [T.spin(1, 'io')], 'happy');
  A('repos', 'sourire', 'Sourire', 1.4, 'Quand on le regarde', [T.grw(.06)], 'happy');

  const FAMS = [
    { id: 'accueil', n: 'Accueil', d: 'Saluer, accueillir, dire au revoir.', c: 'a5' },
    { id: 'joie', n: 'Joie', d: 'Fêter une réussite ou un merci.', c: 'a3' },
    { id: 'reflexion', n: 'Réflexion', d: 'Chercher, calculer, préparer une réponse.', c: 'g5' },
    { id: 'ecoute', n: 'Écoute', d: 'Entendre la voix et montrer qu’il a compris.', c: 'g4' },
    { id: 'alerte', n: 'Notifications', d: 'Prévenir sans déranger.', c: 'a7' },
    { id: 'emotion', n: 'Émotions', d: 'Réagir avec nuance.', c: 'a4' },
    { id: 'physique', n: 'Physique', d: 'Rouler, rebondir, tomber : le corps de l’étoile.', c: 'n6' },
    { id: 'couleur', n: 'Couleurs', d: 'Changer de teinte pour dire un état.', c: 'g6' },
    { id: 'systeme', n: 'Téléphone', d: 'Batterie, réseau, téléchargements.', c: 'n8' },
    { id: 'moment', n: 'Moments', d: 'Heures, météo, jours de fête.', c: 'a6' },
    { id: 'jeu', n: 'Jeux', d: 'Petits tours pour s’amuser.', c: 'g7' },
    { id: 'repos', n: 'Repos', d: 'Vivre doucement quand rien ne se passe.', c: 'n4' }
  ];
  const TAP = ['salut', 'clin', 'rire', 'surpris', 'malicieux', 'sourire', 'coucou', 'gelee'];
  const AMB = LIST.filter(a => a.fam === 'repos').map(a => a.id).concat(['clin', 'scintille']);
  function X(id, d, t, e, c, x) { const o = { fam: 'extra', id, n: id, d, w: '', t: t || [], e: e || 'open', c: c || null, x: x || [], trail: 0, num: 0 }; o.x.forEach(f => { if (f.k === 'tr') o.trail = f.n; }); BY[id] = o; }
  X('eveil', .45, [T.grw(.2, .55, .45)], E('closed', .35, 'wide'), C.to('a3', .55, .45, 1), [F.tw(3, 'a3', .45)]);
  X('envol', .7, [T.spin(1, 'io')], 'happy', null, [F.tr(3)]);
  X('plane', .55, [T.tilt(-14), T.strch(.06)], 'wide', null, [F.tr(2)]);
  X('eclot', .6, [T.grw(.35, .5, .5)], E('wide', .6, 'happy'), C.to('a3', .5, .5, 1), [F.ring('a3', .15, .7, 2.6), F.rays(10, 'a3', .2, .7, 40)]);
  X('atterrit', .6, [T.land()], E('happy', .85, 'open'), null, [F.b(7, 'star', 'a3', 1.4, .28, 0, .7)]);
  X('chute', 1.0, [T.strch(.06, .2, .2)], E('wide', .7, 'happy'));
  X('pose', .45, [T.land()], E('closed', .3, 'open'));

  /* ---------- formes des effets (rayon 10) ---------- */
  const SH = {
    star: 'M0 -10Q1.6 -1.6 10 0Q1.6 1.6 0 10Q-1.6 1.6 -10 0Q-1.6 -1.6 0 -10Z',
    dot: 'M-6 0A6 6 0 1 0 6 0A6 6 0 1 0 -6 0Z',
    heart: 'M0 9C-6 4.5 -10 1 -10 -3.5C-10 -7 -7.5 -9 -5 -9C-2.5 -9 -1 -7.5 0 -6C1 -7.5 2.5 -9 5 -9C7.5 -9 10 -7 10 -3.5C10 1 6 4.5 0 9Z',
    drop: 'M0 -10C3 -5 7 -1 7 3A7 7 0 0 1 -7 3C-7 -1 -3 -5 0 -10Z',
    spark: 'M0 -10C1 -10 1.6 -9.4 1.6 -8.4V8.4C1.6 9.4 1 10 0 10C-1 10 -1.6 9.4 -1.6 8.4V-8.4C-1.6 -9.4 -1 -10 0 -10Z',
    note: 'M1 -10H8V-5.5H4.5V5A4.5 4.5 0 1 1 1 0.6Z',
    bolt: 'M3 -10L-6 2H0L-3 10L6 -2H0Z',
    leaf: 'M-9 7C-9 -3 -2 -9 9 -9C9 2 3 8 -9 7Z',
    cloud: 'M-10 6A5 5 0 0 1 -8 -3A6 6 0 0 1 3 -6A5 5 0 0 1 10 1A4 4 0 0 1 8 6Z',
    moon: 'M2 -10A10 10 0 1 0 10 2A7.5 7.5 0 1 1 2 -10Z',
    check: 'M-9 0L-6 -3L-2 1L6 -7L9 -4L-2 7Z',
    arrow: 'M-3 -10H3V-1H8L0 9L-8 -1H-3Z',
    balloon: 'M0 -10C5 -10 8 -6 8 -2C8 3 4 6 0 6C-4 6 -8 3 -8 -2C-8 -6 -5 -10 0 -10ZM-1.2 6H1.2L2 10H-2Z',
    flake: 'M-1.2 -9H1.2V-1.2H9V1.2H1.2V9H-1.2V1.2H-9V-1.2H-1.2Z',
    arcw: 'M0 -8Q7 0 0 8L-2.5 6Q2.5 0 -2.5 -6Z',
    conf: 'M-5 -3H5V3H-5Z'
  };

  /* ---------- yeux (repère : centre de l’étoile) ---------- */
  const EY = (() => {
    const c = (x, y, r) => ({ t: 'circle', a: { cx: x, cy: y, r } });
    const st = (d, w) => ({ t: 'path', a: { d }, s: w || 6 });
    const fi = d => ({ t: 'path', a: { d } });
    const pair = f => [f(-14), f(14)];
    const heart = x => fi('M' + x + ' 5C' + (x - 5) + ' 1.5 ' + (x - 9) + ' -1 ' + (x - 9) + ' -4.5C' + (x - 9) + ' -8 ' + (x - 6) + ' -10 ' + (x - 3.5) + ' -10C' + (x - 1.5) + ' -10 ' + (x - .5) + ' -8.5 ' + x + ' -7.5C' + (x + .5) + ' -8.5 ' + (x + 1.5) + ' -10 ' + (x + 3.5) + ' -10C' + (x + 6) + ' -10 ' + (x + 9) + ' -8 ' + (x + 9) + ' -4.5C' + (x + 9) + ' -1 ' + (x + 5) + ' 1.5 ' + x + ' 5Z');
    const spk = x => fi('M' + x + ' -12Q' + (x + 1.8) + ' -3.8 ' + (x + 9) + ' -2Q' + (x + 1.8) + ' -.2 ' + x + ' 8Q' + (x - 1.8) + ' -.2 ' + (x - 9) + ' -2Q' + (x - 1.8) + ' -3.8 ' + x + ' -12Z');
    const spi = x => st('M' + (x - 1.5) + ' -2a1.5 1.5 0 1 1 3 0a3.5 3.5 0 1 1 -7 0a5.5 5.5 0 1 1 11 0', 2.6);
    const X = x => st('M' + (x - 6) + ' -8L' + (x + 6) + ' 4M' + (x + 6) + ' -8L' + (x - 6) + ' 4', 5);
    return {
      open: pair(x => c(x, -2, 9)), wide: pair(x => c(x, -2, 11)), small: pair(x => c(x, -2, 6)), dot: pair(x => c(x, -1, 4)),
      up: pair(x => c(x, -8, 8.5)), down: pair(x => c(x, 3, 8.5)),
      happy: pair(x => st('M' + (x - 8) + ' 0Q' + x + ' -10 ' + (x + 8) + ' 0')),
      closed: pair(x => st('M' + (x - 8) + ' -2H' + (x + 8))),
      sleepy: pair(x => st('M' + (x - 8) + ' -3Q' + x + ' 3 ' + (x + 8) + ' -3')),
      wink: [c(-14, -2, 9), st('M6 0Q14 -10 22 0')],
      heart: pair(heart), star: pair(spk), spiral: pair(spi), x: pair(X),
      sad: [c(-14, 1, 7), c(14, 1, 7), st('M-22 -9L-8 -14', 4), st('M8 -14L22 -9', 4)],
      angry: [c(-14, 0, 7), c(14, 0, 7), st('M-22 -14L-8 -9', 4), st('M8 -9L22 -14', 4)],
      q: [c(-14, -2, 11), c(14, -2, 6)],
      shine: [c(-14, -2, 9), c(14, -2, 9), { t: 'circle', a: { cx: -11, cy: -6, r: 3 }, w: 1 }, { t: 'circle', a: { cx: 17, cy: -6, r: 3 }, w: 1 }],
      tear: [c(-14, -2, 9), c(14, -2, 9), { t: 'path', a: { d: 'M18 8C20 11 22 13 22 15A4 4 0 0 1 14 15C14 13 16 11 18 8Z' }, g: 1 }],
      sweat: [c(-14, -2, 9), c(14, -2, 9), { t: 'path', a: { d: 'M40 -34C42 -31 44 -29 44 -27A4 4 0 0 1 36 -27C36 -29 38 -31 40 -34Z' }, g: 1 }],
      cool: [fi('M-27 -9H27V-6Q27 6 15 6Q7 6 4 -2H-4Q-7 6 -15 6Q-27 6 -27 -6Z')]
    };
  })();

  /* ---------- effets ---------- */
  function fxItems(fx, p, S, cx, cy, out) {
    const k = fx.k, col = (c, i) => Array.isArray(c) ? c[i % c.length] : c;
    if (k === 'b') { const q = seg(p, fx.at, fx.at + fx.l); if (q <= 0 || q >= 1) return; for (let i = 0; i < fx.n; i++) { const a = (i / fx.n) * TAU + (rnd(i, 1) - .5) * .5 - PI / 2, d = fx.d * S * oc(q) * (.75 + .5 * rnd(i, 2)); out.f.push({ sh: fx.sh, x: cx + cos(a) * d, y: cy + sin(a) * d, z: fx.z * S * .5 * (1 - .45 * q) * (.7 + .6 * rnd(i, 3)), r: (rnd(i, 4) - .5) * 300 * q, op: 1 - q * q, c: col(fx.c, i) }); } return; }
    if (k === 'cf') { const q = seg(p, fx.at, fx.at + fx.l); if (q <= 0 || q >= 1) return; const CC = ['a3', 'a', 'g4', 'g6', 'w', 'a6']; for (let i = 0; i < fx.n; i++) { const vx = (rnd(i, 1) - .5) * 3.2, vy = -1.4 - rnd(i, 2) * 1.2; out.f.push({ sh: i % 3 ? 'conf' : 'star', x: cx + vx * S * q, y: cy + (vy * q + 2.6 * q * q) * S, z: S * .09 * (.8 + .4 * rnd(i, 3)), r: (rnd(i, 4) > .5 ? 1 : -1) * 540 * q, op: 1 - seg(q, .7, 1), c: CC[i % CC.length] }); } return; }
    if (k === 'up') { for (let i = 0; i < fx.n; i++) { const st = fx.at + i * fx.l * .22, q = seg(p, st, st + fx.l * .65); if (q <= 0 || q >= 1) continue; const side = i % 2 ? 1 : -1; out.f.push({ sh: fx.sh, x: cx + side * S * (.3 + .1 * i) + sin(q * 6 + i) * S * .1, y: cy - S * (.45 + 1.15 * q), z: fx.z * S * .5 * (.6 + .4 * oc(min(1, q * 3))), r: sin(q * 5 + i) * 14, op: min(1, q * 5) * (1 - seg(q, .65, 1)), c: col(fx.c, i) }); } return; }
    if (k === 'sky') { const e = env(p, .15, .2); if (e <= 0) return; for (let i = 0; i < fx.n; i++) { const q = (p * (fx.sh === 'flake' ? 1.1 : 1.8) + rnd(i, 1)) % 1; out.f.push({ sh: fx.sh, x: cx + (rnd(i, 2) - .5) * 3 * S + fx.dir * q * S * 1.2, y: cy - 1.5 * S + q * 3 * S, z: fx.z * S * .5 * (.8 + .4 * rnd(i, 3)), r: fx.sh === 'drop' ? 0 : q * 200 * (rnd(i, 4) > .5 ? 1 : -1), op: e * min(1, q * 6) * (1 - seg(q, .75, 1)), c: col(fx.c, i) }); } return; }
    if (k === 'orb') { const e = env(p, .12, .2); if (e <= 0) return; for (let i = 0; i < fx.n; i++) { const a = TAU * (fx.t * p + i / fx.n), front = sin(a) > 0; (front ? out.f : out.b).push({ sh: fx.sh, x: cx + cos(a) * fx.r * S, y: cy - S * .12 + sin(a) * fx.r * S * .42, z: fx.z * S * .5 * e * (front ? 1 : .8), r: a * 57.3, op: e * (front ? 1 : .6), c: col(fx.c, i) }); } return; }
    if (k === 'ring') { const q = seg(p, fx.at, fx.at + fx.l); if (q <= 0 || q >= 1) return; out.r.push({ x: cx, y: cy, rad: S * (.5 + (fx.r - .5) * oc(q)), w: max(1, fx.w * S * (1 - .6 * q)), op: (1 - q) * .9, c: fx.c }); return; }
    if (k === 'pr') { const e = 1 - seg(p, .82, 1), q = io(seg(p, .05, .8)), w = max(1.5, S * .07); out.r.push({ x: cx, y: cy, rad: S * .78, w, op: .35 * e, c: 'n5' }); out.r.push({ x: cx, y: cy, rad: S * .78, w, op: e, c: fx.c, dash: q }); return; }
    if (k === 'rays') { const q = seg(p, fx.at, fx.at + fx.l); if (q <= 0 || q >= 1) return; const b = bell(q, .5, .5); for (let i = 0; i < fx.n; i++) { const a = i / fx.n * TAU + fx.rot * p * PI / 180, d = S * (.82 + .3 * oc(q)); out.b.push({ sh: 'spark', x: cx + cos(a) * d, y: cy + sin(a) * d, z: S * .2 * b, r: a * 57.3 + 90, op: b, c: col(fx.c, i) }); } return; }
    if (k === 'tw') { const e = env(p, .1, .15); if (e <= 0) return; for (let i = 0; i < fx.n; i++) { const a = rnd(i, 1) * TAU, d = S * (.75 + .55 * rnd(i, 2)), q = (p * 1.4 + rnd(i, 3)) % 1; out.f.push({ sh: 'star', x: cx + cos(a) * d, y: cy + sin(a) * d * .8, z: fx.z * S * .5 * bell(q, .5, .5) * e, r: q * 90, op: e, c: col(fx.c, i) }); } return; }
    if (k === 'tx') { const q = seg(p, fx.at, fx.at + fx.l); if (q <= 0 || q >= 1) return; out.x.push({ t: fx.t, x: cx + S * .62, y: cy - S * .55 - S * .45 * oc(q), size: S * (fx.t.length > 1 ? .42 : .62), op: min(1, q * 6) * (1 - seg(q, .7, 1)), c: fx.c }); return; }
    if (k === 'zz') { for (let i = 0; i < 2; i++) { const q = seg(p, .15 + i * .3, .65 + i * .3); if (q <= 0 || q >= 1) continue; out.x.push({ t: 'z', x: cx + S * (.5 + .35 * q + .15 * i), y: cy - S * (.5 + .6 * q + .1 * i), size: S * (.38 + .12 * i), op: min(1, q * 5) * (1 - seg(q, .7, 1)), c: fx.c }); } return; }
    if (k === 'arc') { const e = env(p, .1, .2); if (e <= 0) return; for (let i = 0; i < fx.n; i++) { const q = (p * 2.2 + i / fx.n) % 1; out.f.push({ sh: 'arcw', x: cx + fx.side * S * (.62 + .55 * q), y: cy, z: S * (.18 + .3 * q), r: fx.side > 0 ? 0 : 180, op: e * (1 - q) * min(1, q * 8), c: col(fx.c, i) }); } return; }
    if (k === 'bk') { const e = env(p, .2, .25); if (e <= 0) return; out.b.push({ sh: fx.sh, x: cx + fx.dx * S, y: cy + fx.dy * S, z: fx.z * S * .5 * (.85 + .15 * e), r: 0, op: e * .95, c: fx.c }); return; }
    if (k === 'bolt') { const o = max(bell(p, fx.at, .05), bell(p, fx.at + .16, .04), bell(p, fx.at + .5, .05) * .7); if (o <= 0) return; out.f.push({ sh: 'bolt', x: cx - S * .55, y: cy - S * .75, z: S * .25, r: 12, op: o, c: 'a3' }); return; }
    if (k === 'ck') { const q = seg(p, fx.at, fx.at + .55); if (q <= 0 || q >= 1) return; out.f.push({ sh: 'check', x: cx + S * .68, y: cy - S * .5, z: S * .22 * ob(min(1, q * 2.5)), r: 0, op: 1 - seg(q, .75, 1), c: fx.c }); return; }
    if (k === 'in') { const q = seg(p, fx.at, fx.at + fx.l); if (q <= 0 || q >= 1) return; out.f.push({ sh: fx.sh, x: cx, y: cy - S * 1.6 + S * 1.4 * io(q), z: S * .18, r: 0, op: min(1, q * 4) * (1 - seg(q, .8, 1)), c: fx.c }); return; }
    if (k === 'fw') { const CC = ['a3', 'g4', 'w', 'a4']; for (let j = 0; j < fx.n; j++) { const at = .1 + j * .24, q = seg(p, at, at + .42); if (q <= 0 || q >= 1) continue; const ox = cx + (rnd(j, 7) - .5) * 2.6 * S, oy = cy - S * (.7 + rnd(j, 8) * .7); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, d = S * .75 * oc(q); out.f.push({ sh: 'spark', x: ox + cos(a) * d, y: oy + sin(a) * d + q * q * S * .3, z: S * .09 * (1 - .5 * q), r: a * 57.3 + 90, op: 1 - q * q, c: CC[(i + j) % CC.length] }); } } }
  }

  /* ---------- images clés ---------- */
  const MODES = {
    idle: t => ({ s: 1 + .03 * sin(TAU * t / 3.6), y: -.02 * sin(TAU * t / 3.6) }),
    listen: (t, b, Q) => ({ s: 1 + .05 * Math.pow(sin(PI * t / 1.1), 2), col: mix(b, Q.g5, .55), eyes: 'up', glow: .25 }),
    think: (t, b, Q) => ({ r: 7 * sin(TAU * t / 1.5), s: 1 + .04 * sin(TAU * t / .75), col: mix(b, Q.a3, .25 + .2 * sin(TAU * t / 1.5)), eyes: 'up' }),
    read: t => { const q = (t % 2.6) / 2.6; return { s: 1 + .012 * sin(TAU * t / 4.4), eyes: 'down', ex: -.55 + 1.1 * ss(min(1, q * 1.15)), ey: .2 }; },
    sleep: (t, b, Q) => ({ s: 1 + .035 * sin(TAU * t / 4.8), y: .03, col: mix(b, Q.a3, .5), eyes: 'closed' })
  };
  function modeFrame(m, t, b, Q) { return Object.assign({ x: 0, y: 0, r: 0, s: 1, sx: 1, sy: 1, fy: 1, op: 1, glow: 0, ex: 0, ey: 0, blink: 0, col: b, grad: null, eyes: 'open', A: null, p: 0 }, (MODES[m] || MODES.idle)(t, b, Q)); }
  function evalClip(A, p, base, Q) {
    const f = { x: 0, y: 0, r: 0, s: 1, sx: 1, sy: 1, fy: 1, op: 1, glow: 0, ex: 0, ey: 0, blink: 0, col: base, grad: null, eyes: 'open', A, p };
    for (let i = 0; i < A.t.length; i++) { const v = A.t[i](p); for (const k in v) { if (k === 's' || k === 'sx' || k === 'sy' || k === 'fy' || k === 'op') f[k] *= v[k]; else f[k] += v[k]; } }
    if (A.c) { const v = A.c(p, Q, base); if (v.col) f.col = v.col; if (v.grad) f.grad = v.grad; if (v.glow) f.glow += v.glow; }
    const e = A.e; if (typeof e === 'string') f.eyes = e; else { let cur = e[0][1]; for (let i = 0; i < e.length; i++) if (p >= e[i][0]) cur = e[i][1]; f.eyes = cur; }
    return f;
  }
  function compose(m, c, w) {
    const f = Object.assign({}, m);
    f.x = m.x + c.x * w; f.y = m.y + c.y * w; f.r = m.r + c.r * w; f.s = m.s * (1 + (c.s - 1) * w); f.sx = m.sx * (1 + (c.sx - 1) * w); f.sy = m.sy * (1 + (c.sy - 1) * w);
    f.fy = 1 + (c.fy - 1) * w; f.op = m.op * (1 + (c.op - 1) * w); f.glow = m.glow + c.glow * w; f.ex = m.ex + c.ex * w; f.ey = m.ey + c.ey * w; f.col = mix(m.col, c.col, w);
    f.grad = c.grad ? [mix(m.col, c.grad[0], w), mix(m.col, c.grad[1], w), c.grad[2]] : m.grad;
    if (c.eyes && c.eyes !== 'open') f.eyes = c.eyes; f.A = c.A; f.p = c.p; return f;
  }
  const nA = r => ((r % 360) + 540) % 360 - 180;
  function lerpF(a, b, w) {
    if (w >= 1) return b; if (w <= 0) return a;
    const f = Object.assign({}, b);
    ['x', 'y', 's', 'sx', 'sy', 'fy', 'op', 'glow', 'ex', 'ey', 'blink'].forEach(k => { f[k] = a[k] + (b[k] - a[k]) * w; });
    let dr = nA(b.r) - nA(a.r); if (dr > 180) dr -= 360; if (dr < -180) dr += 360; f.r = nA(a.r) + dr * w;
    f.col = mix(a.col, b.col, w);
    if (a.grad || b.grad) { const ga = a.grad || [a.col, a.col, b.grad[2]], gb = b.grad || [b.col, b.col, a.grad[2]]; f.grad = [mix(ga[0], gb[0], w), mix(ga[1], gb[1], w), ga[2] + (gb[2] - ga[2]) * w]; }
    f.eyes = w < .5 ? a.eyes : b.eyes; return f;
  }

  /* ---------- capteurs ---------- */
  const SENS = { beta: 0, gamma: 0, face: false, real: false, on: false, listeners: new Set() };
  SENS.emit = type => SENS.listeners.forEach(f => { try { f(type); } catch (e) { } });
  function setT(b, g, src) { if (src === 'sim' && SENS.real) return; SENS.beta = b; SENS.gamma = g; const face = abs(b) > 140; if (face !== SENS.face) { SENS.face = face; SENS.emit(face ? 'flip' : 'unflip'); } SENS.emit('tilt'); }
  SENS.sim = (b, g) => setT(b, g, 'sim');
  SENS.shake = () => SENS.emit('shake');
  SENS.drop = () => SENS.emit('drop');
  let hits = [], lowAt = 0, lastShake = 0, lastDrop = 0;
  function onOri(e) { if (e.beta == null && e.gamma == null) return; SENS.real = true; setT(e.beta || 0, e.gamma || 0, 'real'); }
  function onMot(e) { const a = e.accelerationIncludingGravity; if (!a || a.x == null) return; const m = sqrt(a.x * a.x + a.y * a.y + a.z * a.z), now = performance.now(); if (abs(m - 9.81) > 11) { hits = hits.filter(x => now - x < 800); hits.push(now); if (hits.length >= 3 && now - lastShake > 1800) { lastShake = now; hits = []; SENS.emit('shake'); } } if (m < 2.5) { if (!lowAt) lowAt = now; else if (now - lowAt > 110 && now - lastDrop > 2000) { lastDrop = now; SENS.emit('drop'); } } else lowAt = 0; }
  SENS.enable = function () {
    const go = () => { if (!SENS.on) { window.addEventListener('deviceorientation', onOri); window.addEventListener('devicemotion', onMot); SENS.on = true; } return new Promise(res => setTimeout(() => res(SENS.real ? 'ok' : 'absent'), 1000)); };
    try { const DO = window.DeviceOrientationEvent, DM = window.DeviceMotionEvent; if (DO && typeof DO.requestPermission === 'function') { const ps = [DO.requestPermission()]; if (DM && typeof DM.requestPermission === 'function') ps.push(DM.requestPermission().catch(() => 'denied')); return Promise.all(ps).then(r => r[0] === 'granted' ? go() : 'refus').catch(() => 'refus'); } } catch (e) { return Promise.resolve('refus'); }
    return go();
  };

  /* ---------- scène ---------- */
  let UID = 0, REDUCE = false, raf = 0, lastTs = 0;
  try { REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { }
  const STAGES = new Set();
  function loop(ts) { raf = 0; const dt = lastTs ? min(.05, max(0, (ts - lastTs) / 1000)) : .016; lastTs = ts; STAGES.forEach(s => { if (s.err) return; try { s.tick(dt); } catch (e) { s.err = true; if (window.console) console.error('Étoile :', e); } }); if (STAGES.size) raf = requestAnimationFrame(loop); else lastTs = 0; }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  class Spr { constructor(v) { this.v = v; this.t = v; this.d = 0; } to(t, snap) { this.t = t; if (snap) { this.v = t; this.d = 0; } } step(dt) { const a = (this.t - this.v) * 170 - this.d * 20; this.d += a * dt; this.v += this.d * dt; return this.v; } }
  const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  function paint(pool, items) { for (let i = 0; i < pool.length; i++) { const n = pool[i], it = items[i]; if (!it) { if (n._on) { n.setAttribute('opacity', '0'); n._on = false; } continue; } if (n._sh !== it.sh) { n.setAttribute('d', SH[it.sh] || SH.dot); n._sh = it.sh; } n.setAttribute('transform', 'translate(' + it.x.toFixed(1) + ' ' + it.y.toFixed(1) + ') rotate(' + (it.r || 0).toFixed(1) + ') scale(' + max(.001, it.z / 10).toFixed(3) + ')'); n.setAttribute('fill', RGB(it.c)); n.setAttribute('opacity', cl(it.op, 0, 1).toFixed(3)); n._on = true; } }
  function paintR(pool, items) { for (let i = 0; i < pool.length; i++) { const n = pool[i], it = items[i]; if (!it) { if (n._on) { n.setAttribute('opacity', '0'); n._on = false; } continue; } n.setAttribute('cx', it.x.toFixed(1)); n.setAttribute('cy', it.y.toFixed(1)); n.setAttribute('r', max(.1, it.rad).toFixed(1)); n.setAttribute('stroke', RGB(it.c)); n.setAttribute('stroke-width', it.w.toFixed(2)); n.setAttribute('opacity', cl(it.op, 0, 1).toFixed(3)); if (it.dash != null) { const L = TAU * it.rad; n.setAttribute('stroke-dasharray', L.toFixed(1)); n.setAttribute('stroke-dashoffset', (L * (1 - it.dash)).toFixed(1)); n.setAttribute('transform', 'rotate(-90 ' + it.x.toFixed(1) + ' ' + it.y.toFixed(1) + ')'); n._d = true; } else if (n._d) { n.removeAttribute('stroke-dasharray'); n.removeAttribute('stroke-dashoffset'); n.removeAttribute('transform'); n._d = false; } n._on = true; } }
  function paintX(pool, items) { for (let i = 0; i < pool.length; i++) { const n = pool[i], it = items[i]; if (!it) { if (n._on) { n.setAttribute('opacity', '0'); n._on = false; } continue; } if (n.textContent !== it.t) n.textContent = it.t; n.setAttribute('x', it.x.toFixed(1)); n.setAttribute('y', it.y.toFixed(1)); n.setAttribute('font-size', max(6, it.size).toFixed(1)); n.setAttribute('fill', RGB(it.c)); n.setAttribute('opacity', cl(it.op, 0, 1).toFixed(3)); n._on = true; } }

  class Stage {
    constructor(host, o) {
      this.o = o = Object.assign({ w: 200, h: 200, x: 100, y: 100, size: 40, base: 'a', motion: true, react: true, ambient: false, follow: true, chamel: false, speed: 1 }, o || {});
      const Q = pal();
      this.host = host; this.uid = ++UID;
      this.ax = new Spr(o.x); this.ay = new Spr(o.y); this.as = new Spr(o.size);
      this.trk = o.track || [o.x, o.x];
      this.bFrom = Q[o.base] || Q.a; this.bTo = this.bFrom; this.bT0 = -9;
      this.mode = o.mode || 'idle'; this.mPrev = this.mode; this.mT0 = -9;
      this.t = 0; this.clip = null; this.snap = null; this.cur = null;
      this.off = 0; this.vel = 0; this.roll = 0; this.sq = 0; this.drag = null;
      this.orbit = o.orbit || null; this.oAng = 0;
      this.hist = []; this.blinkAt = 1.5 + Math.random() * 3; this.ambAt = 6 + Math.random() * 6;
      this.vis = true; this.dead = false; this.err = false;
      this.build();
      if (o.react) { this.sub = type => this.onSens(type); SENS.listeners.add(this.sub); }
      if (typeof IntersectionObserver !== 'undefined') { this.io = new IntersectionObserver(es => es.forEach(e => { this.vis = e.isIntersecting; })); this.io.observe(host); }
      STAGES.add(this); kick();
    }
    build() {
      const o = this.o, id = 'mst' + this.uid;
      const svg = this.svg = mk('svg', { width: o.w, height: o.h, viewBox: '0 0 ' + o.w + ' ' + o.h, style: 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none' });
      const defs = mk('defs', null, svg);
      const hg = mk('radialGradient', { id: id + 'h' }, defs); this.h0 = mk('stop', { offset: '0', 'stop-opacity': '.6' }, hg); this.h1 = mk('stop', { offset: '1', 'stop-opacity': '0' }, hg);
      this.lg = mk('linearGradient', { id: id + 'g', x1: '0', y1: '0', x2: '1', y2: '1' }, defs); this.g0 = mk('stop', { offset: '0' }, this.lg); this.g1 = mk('stop', { offset: '1' }, this.lg);
      this.gUrl = 'url(#' + id + 'g)';
      const back = mk('g', null, svg);
      this.halo = mk('circle', { r: 0, fill: 'url(#' + id + 'h)', opacity: 0 }, back);
      this.ghosts = [0, 1, 2].map(() => mk('path', { d: STAR, opacity: 0 }, back));
      this.bPool = Array.from({ length: 12 }, () => mk('path', { opacity: 0 }, back));
      this.rPool = Array.from({ length: 5 }, () => mk('circle', { fill: 'none', opacity: 0, 'stroke-linecap': 'round' }, back));
      this.starG = mk('g', null, svg);
      const inner = mk('g', { transform: 'translate(-625 -328)' }, this.starG);
      this.body = mk('path', { d: STAR }, inner);
      this.eyesG = mk('g', null, this.starG); this.eyeType = '';
      const front = mk('g', null, svg);
      this.fPool = Array.from({ length: 44 }, () => mk('path', { opacity: 0 }, front));
      this.xPool = Array.from({ length: 4 }, () => mk('text', { 'text-anchor': 'middle', 'dominant-baseline': 'middle', opacity: 0, style: 'font-family:var(--font-heading)' }, front));
      this.host.appendChild(svg);
    }
    play(id) { const A = typeof id === 'string' ? BY[id] : id; if (!A || this.dead) return; this.snap = this.cur ? Object.assign({}, this.cur) : null; this.clip = { A, t0: this.t }; }
    stop() { this.clip = null; }
    setMode(m) { if (!MODES[m] || m === this.mode) return; this.mPrev = this.mode; this.mode = m; this.mT0 = this.t; }
    baseNow() { return mix(this.bFrom, this.bTo, ss(cl((this.t - this.bT0) / .5, 0, 1))); }
    setBase(k) { const Q = pal(); this.bFrom = this.baseNow(); this.bTo = Q[k] || Q.a; this.bT0 = this.t; }
    setAnchor(x, y, size, snap) { this.ax.to(x, snap); this.ay.to(y, snap); if (size) this.as.to(size, snap); }
    setTrack(a, b) { this.trk = [a, b == null ? a : b]; }
    setOrbit(ob) { this.orbit = ob || null; }
    set(o) { Object.assign(this.o, o); }
    dragTo(dx) { this.drag = dx; }
    release() { this.drag = null; }
    fly(o, cb) { this.flight = { x0: this.ax.v, y0: this.ay.v, s0: this.as.v, x1: o.x, y1: o.y, s1: o.size || this.as.v, cx: o.cx == null ? (this.ax.v + o.x) / 2 : o.cx, cy: o.cy == null ? (this.ay.v + o.y) / 2 : o.cy, d: o.d || .6, ex: o.ex || 'io', ey: o.ey || o.ex || 'io', es: o.es || 'io', t0: this.t, cb }; this.trk = o.track || [o.x, o.x]; this.off = 0; this.vel = 0; }
    destroy() { this.dead = true; STAGES.delete(this); if (this.sub) SENS.listeners.delete(this.sub); if (this.io) this.io.disconnect(); if (this.svg.parentNode) this.svg.parentNode.removeChild(this.svg); }
    onSens(type) {
      if (this.dead || !this.o.motion) return;
      if (type === 'flip') { this.sleepPrev = this.mode; this.setMode('sleep'); return; }
      if (type === 'unflip') { this.setMode(this.sleepPrev && this.sleepPrev !== 'sleep' ? this.sleepPrev : 'idle'); this.play('retour'); return; }
      if (REDUCE || this.o.reduce || this.mode === 'read') return;
      if (type === 'shake') this.play('vertige'); else if (type === 'drop') this.play('apesanteur');
    }
    tick(dt) {
      const o = this.o, Q = pal(), red = REDUCE || o.reduce, sdt = dt * (o.speed || 1);
      this.t += sdt; const t = this.t;
      if (this.flight) { const f = this.flight, q = cl((t - f.t0) / f.d, 0, 1), ex = EZ[f.ex](q), ey = EZ[f.ey](q), u = 1 - ex, v = 1 - ey; this.ax.to(u * u * f.x0 + 2 * u * ex * f.cx + ex * ex * f.x1, true); this.ay.to(v * v * f.y0 + 2 * v * ey * f.cy + ey * ey * f.y1, true); this.as.to(f.s0 + (f.s1 - f.s0) * EZ[f.es](q), true); if (q >= 1) { this.flight = null; if (f.cb) { try { f.cb(); } catch (x) { } } } }
      if (this.orbit) { const ob = this.orbit; let a; if (ob.angle != null) a = ob.angle; else { this.oAng += sdt * TAU / (ob.period || 2.4); a = this.oAng; } this.ax.to(ob.cx + cos(a) * ob.r); this.ay.to(ob.cy + sin(a) * ob.r); }
      const ax = this.ax.step(sdt), ay = this.ay.step(sdt), S = max(4, this.as.step(sdt));
      let gx = 0, gy = 0;
      if (!SENS.face) { gx = sin(cl(SENS.gamma, -80, 80) * PI / 180); gy = sin(cl(SENS.beta, -80, 80) * PI / 180); }
      const phys = o.motion && !red && this.mode !== 'read' && !this.orbit && !this.flight;
      if (phys) {
        const lo = this.trk[0] - this.ax.t, hi = this.trk[1] - this.ax.t;
        if (this.drag != null) { const tg = cl(this.drag, lo - S * .3, hi + S * .3); this.vel = this.vel * .5 + (tg - this.off) / max(sdt, .001) * .5; this.off = tg; }
        else { const acc = gx * 1500 - this.off * 10 - this.vel * 2.4; this.vel += acc * sdt; this.off += this.vel * sdt; if (this.off < lo) { this.off = lo; if (this.vel < -60) this.sq = min(.1, -this.vel / 2400); this.vel = -this.vel * .38; } else if (this.off > hi) { this.off = hi; if (this.vel > 60) this.sq = min(.1, this.vel / 2400); this.vel = -this.vel * .38; } }
        this.roll += this.vel * sdt / (S * .48) * 57.3;
        if (abs(this.vel) < 50) { const tg = Math.round(this.roll / 360) * 360; this.roll += (tg - this.roll) * (1 - Math.exp(-sdt * 3)); }
      } else { this.off += -this.off * (1 - Math.exp(-sdt * 8)); this.vel = 0; const tg = Math.round(this.roll / 360) * 360; this.roll += (tg - this.roll) * (1 - Math.exp(-sdt * 6)); }
      this.sq *= Math.exp(-sdt * 10);
      const base = this.baseNow();
      let fr = modeFrame(this.mode, t, base, Q);
      if (t - this.mT0 < .45) fr = lerpF(modeFrame(this.mPrev, t, base, Q), fr, ss((t - this.mT0) / .45));
      if (!this.clip && this.mode !== 'sleep' && t >= this.blinkAt) { const ph = (t - this.blinkAt) / .16; if (ph >= 1) this.blinkAt = t + 2.2 + Math.random() * 3.5; else fr.blink = sin(PI * ph); }
      if (o.ambient && !this.clip && this.mode === 'idle' && t > this.ambAt) { this.ambAt = t + 9 + Math.random() * 7; this.play(AMB[flo(Math.random() * AMB.length)]); }
      if (this.clip) {
        const A = this.clip.A, tc = t - this.clip.t0, p = tc / A.d;
        if (p >= 1) { this.clip = null; this.snap = null; if (o.onEnd) { try { o.onEnd(A.id); } catch (e) { } } }
        else { const cf = evalClip(A, p, fr.col, Q); let f2 = compose(fr, cf, ss(cl(min(tc / .08, (A.d - tc) / .08), 0, 1))); if (this.snap && tc < .16) f2 = lerpF(this.snap, f2, ss(tc / .16)); fr = f2; }
      }
      if (phys && o.follow) { fr.ex += cl(gx * 1.2, -1, 1) * .8; fr.ey += cl((gy - .35) * 1.2, -1, 1) * .5; }
      if (o.chamel && !red) fr.col = mix(fr.col, gx < 0 ? Q.g5 : Q.a7, min(1, abs(gx) * 1.6));
      if (red) { fr.x = 0; fr.y = 0; fr.r = 0; fr.s = 1; fr.sx = 1; fr.sy = 1; fr.fy = 1; }
      this.cur = fr;
      if (!this.vis) { this.hist.length = 0; return; }
      const X = ax + this.off + fr.x * S, Y = ay + fr.y * S, R = fr.r + (red ? 0 : this.roll);
      let dsx = fr.sx * (1 - this.sq), dsy = fr.sy * (1 + this.sq * .5);
      const rat = dsx / dsy; if (rat > 1.2 || rat < 1 / 1.2) { const pr = dsx * dsy, rc = cl(rat, 1 / 1.2, 1.2); dsx = sqrt(pr * rc); dsy = sqrt(pr / rc); }
      const k = S / 152, SX = fr.s * dsx * fr.fy * k, SY = fr.s * dsy * k;
      const tf = 'translate(' + X.toFixed(2) + ' ' + Y.toFixed(2) + ') rotate(' + R.toFixed(2) + ') scale(' + (abs(SX) < .0005 ? .0005 : SX).toFixed(4) + ' ' + SY.toFixed(4) + ')';
      this.starG.setAttribute('transform', tf);
      this.starG.setAttribute('opacity', cl(fr.op, 0, 1).toFixed(3));
      const colStr = labRgb(fr.col);
      if (fr.grad) { this.g0.setAttribute('stop-color', labRgb(fr.grad[0])); this.g1.setAttribute('stop-color', labRgb(fr.grad[1])); this.lg.setAttribute('gradientTransform', 'rotate(' + (fr.grad[2] % 360).toFixed(1) + ' .5 .5)'); this.body.setAttribute('fill', this.gUrl); }
      else this.body.setAttribute('fill', colStr);
      const et = fr.fy < 0 ? '' : (fr.eyes || 'open');
      if (et !== this.eyeType) { this.eyeType = et; this.buildEyes(et); this.ink = ''; }
      const lum = fr.grad ? (fr.grad[0][0] + fr.grad[1][0]) / 2 : fr.col[0], ink = lum < .52 ? 'w' : 'k';
      if (ink !== this.ink) { this.ink = ink; this.paintEyes(ink); }
      const bl = cl(fr.blink || 0, 0, 1), ex = cl(fr.ex, -1.2, 1.2) * 6, ey = cl(fr.ey, -1.2, 1.2) * 5;
      this.eyesG.setAttribute('transform', 'translate(' + ex.toFixed(2) + ' ' + (ey - 2).toFixed(2) + ') scale(1 ' + (1 - .9 * bl).toFixed(3) + ') translate(0 2)');
      const glow = fr.glow;
      if (glow > .01) { this.halo.setAttribute('cx', X.toFixed(1)); this.halo.setAttribute('cy', Y.toFixed(1)); this.halo.setAttribute('r', (S * (.85 + .3 * min(1, glow))).toFixed(1)); this.halo.setAttribute('opacity', (min(1, glow) * .9).toFixed(3)); this.h0.setAttribute('stop-color', colStr); this.h1.setAttribute('stop-color', colStr); this.haloOn = true; }
      else if (this.haloOn) { this.halo.setAttribute('opacity', '0'); this.haloOn = false; }
      this.hist.push(tf + ' translate(-625 -328)'); if (this.hist.length > 14) this.hist.shift();
      const trail = !red && fr.A && fr.A.trail;
      for (let i = 0; i < 3; i++) { const g = this.ghosts[i], h = this.hist[this.hist.length - 1 - (i + 1) * 4]; if (trail && h && i < trail) { g.setAttribute('transform', h); g.setAttribute('fill', colStr); g.setAttribute('opacity', (.32 - i * .1).toFixed(2)); g._on = true; } else if (g._on) { g.setAttribute('opacity', '0'); g._on = false; } }
      const out = { f: [], b: [], r: [], x: [] };
      if (!red && fr.A && fr.A.x.length) { const p = fr.p; for (let i = 0; i < fr.A.x.length; i++) { const fx = fr.A.x[i]; if (fx.k !== 'tr') fxItems(fx, p, S, X, Y, out); } }
      paint(this.fPool, out.f); paint(this.bPool, out.b); paintR(this.rPool, out.r); paintX(this.xPool, out.x);
    }
    buildEyes(type) {
      const g = this.eyesG; while (g.firstChild) g.removeChild(g.firstChild); this.eyeEls = [];
      if (!type) return;
      (EY[type] || EY.open).forEach(d => { const e = mk(d.t, d.a, g); if (d.s) { e.setAttribute('fill', 'none'); e.setAttribute('stroke-width', d.s); e.setAttribute('stroke-linecap', 'round'); e.setAttribute('stroke-linejoin', 'round'); } this.eyeEls.push({ e, d }); });
    }
    paintEyes(ink) { const c = RGB(ink); (this.eyeEls || []).forEach(o => { const d = o.d; if (d.w) o.e.setAttribute('fill', RGB('w')); else if (d.g) o.e.setAttribute('fill', RGB('g3')); else if (d.s) o.e.setAttribute('stroke', c); else o.e.setAttribute('fill', c); }); }
  }

  window.ETOILE = { LIST, FAMS, BY, TAP, sensors: SENS, mount: (host, o) => new Stage(host, o), setReduce: v => { REDUCE = !!v; }, getReduce: () => REDUCE };
})();
