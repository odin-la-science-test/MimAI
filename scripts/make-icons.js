/* Génère les icônes PNG MiMai (icône app, adaptive icon, splash, favicon)
   sans dépendance externe : encodage PNG RGBA via zlib de Node.
   Le dessin reproduit le VRAI logo MiMai (disagne/assets/mimai-mark.svg) : le « M » de Mìmir surmonté de son étoile. */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function png(width, height, pixelFn) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0; // filtre none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const o = row + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunks = [];
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  chunks.push(chunk('IHDR', ihdr));
  chunks.push(chunk('IDAT', idat));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; }
  }
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

/* ───────── logo MiMai : tracés exacts de disagne/assets/mimai-mark.svg (repère 300 248 652 602) ─────────
   Les courbes Q sont aplaties en segments ; le bras droit est le miroir du gauche (x' = 1252 - x). */
function flattenQ(pts, n = 16) {
  const out = [];
  let cur = null;
  for (const seg of pts) {
    if (seg.length === 2) { out.push(seg); cur = seg; }
    else { // [cx, cy, x, y]
      const [cx, cy, x, y] = seg; const [x0, y0] = cur;
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y]); }
      cur = [x, y];
    }
  }
  return out;
}
const ARM = flattenQ([[304, 300], [304, 291, 312, 296.5], [559, 466.3], [567, 472, 565.5, 482], [550, 584], [522, 563], [402, 478], [402, 758], [304, 690]]);
const ARM_R = ARM.map(([x, y]) => [1252 - x, y]);
const BODY = [[625, 452], [676, 556], [676, 762], [625, 846], [574, 762], [574, 556]];
const STAR = flattenQ([[625, 252], [645, 308, 696, 328], [645, 348, 625, 404], [605, 348, 554, 328], [605, 308, 625, 252]]);
const SHAPES = [ARM, ARM_R, BODY, STAR].map(poly => {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  return { poly, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
});
const LOGO_CX = 626, LOGO_CY = 549, LOGO_S = 644; // centre et plus grand côté de l'emprise du logo

function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inLogo = (lx, ly) => SHAPES.some(s => lx >= s.x0 && lx <= s.x1 && ly >= s.y0 && ly <= s.y1 && inPoly(lx, ly, s.poly));

/* couverture 0..1 du logo au pixel (x, y) d'un canevas w x h ; fit = part du plus petit côté occupée par le logo */
const SS = 3;
function coverage(x, y, w, h, fit) {
  const side = Math.min(w, h);
  const k = LOGO_S / (fit * side);
  /* test rapide : 4 coins + centre ; si identiques, le pixel est franchement dedans ou dehors (pas de bord) */
  const at = (px, py) => inLogo(LOGO_CX + (px - w / 2) * k, LOGO_CY + (py - h / 2) * k);
  const c0 = at(x, y), c1 = at(x + 1, y), c2 = at(x, y + 1), c3 = at(x + 1, y + 1), cm = at(x + 0.5, y + 0.5);
  if (c0 === c1 && c1 === c2 && c2 === c3 && c3 === cm) return c0 ? 1 : 0;
  let hit = 0;
  for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
    const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
    if (inLogo(LOGO_CX + (px - w / 2) * k, LOGO_CY + (py - h / 2) * k)) hit++;
  }
  return hit / (SS * SS);
}

const BG = [198, 113, 57];    // #c67139 terracotta
const CREAM = [245, 234, 216]; // #f5ead8 crème
const mix = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];

/* icône de l'app : fond terracotta plein, logo crème */
function icon(size, fit = 0.62) {
  return png(size, size, (x, y) => [...mix(BG, CREAM, coverage(x, y, size, size, fit)), 255]);
}
/* splash : logo crème sur transparent (le fond terracotta vient de app.json) */
function splashIcon(size) {
  return png(size, size, (x, y) => [...CREAM, Math.round(255 * coverage(x, y, size, size, 0.8))]);
}

/* adaptive icon Android : le masque système (cercle, squircle…) ne montre que ~61 % centraux
   du canevas (zone sûre 66/108 dp). Le point le plus éloigné du logo est à 0,545 x sa taille
   du centre : fit 0,52 le garde entièrement dans le cercle de la zone sûre. */
const SAFE_FIT = 0.52;
function adaptiveFg(size) {
  return png(size, size, (x, y) => [...CREAM, Math.round(255 * coverage(x, y, size, size, SAFE_FIT))]);
}
/* icône monochrome (Android 13+ « icônes thématiques ») : silhouette opaque, teinte imposée par le système */
function adaptiveMono(size) {
  return png(size, size, (x, y) => [0, 0, 0, Math.round(255 * coverage(x, y, size, size, SAFE_FIT))]);
}
/* visuel de présentation Play Store 1024x500 */
function featureGraphic(w, h) {
  return png(w, h, (x, y) => [...mix(BG, CREAM, coverage(x, y, w, h, 0.66)), 255]);
}

const out = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), icon(1024));
fs.writeFileSync(path.join(out, 'adaptive-icon.png'), adaptiveFg(1024));
fs.writeFileSync(path.join(out, 'adaptive-icon-mono.png'), adaptiveMono(1024));
fs.writeFileSync(path.join(out, 'splash-icon.png'), splashIcon(512));
fs.writeFileSync(path.join(out, 'favicon.png'), icon(48));
/* ressources de la fiche Play Store (à téléverser dans la Play Console) */
const store = path.join(__dirname, '..', 'docs', 'store-assets');
fs.mkdirSync(store, { recursive: true });
fs.writeFileSync(path.join(store, 'icon-512.png'), icon(512));
fs.writeFileSync(path.join(store, 'feature-graphic-1024x500.png'), featureGraphic(1024, 500));
console.log('Icônes écrites dans', out, 'et', store);
