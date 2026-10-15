// Analyse des chemins SVG -> opérations absolues (0=M 1=L 2=Q 3=C 4=Z), partagée par les « cuiseurs » d'animations.
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
export function parsePath(d, tx = 0, ty = 0) {
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

