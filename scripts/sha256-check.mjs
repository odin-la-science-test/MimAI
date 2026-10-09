// Validation de l'implémentation JS pur de sha256 + base64 (celle de crypto.ts)
// contre les implémentations de référence de Node.
import { createHash } from 'node:crypto';

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

function processBlock(H, block, off, w) {
  const dv = new DataView(block.buffer, block.byteOffset + off, 64);
  for (let i = 0; i < 16; i++) w[i] = dv.getUint32(i * 4, false);
  for (let i = 16; i < 64; i++) {
    const x = w[i - 15], y = w[i - 2];
    const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
    const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
  }
  let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
  for (let i = 0; i < 64; i++) {
    const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
    const ch = ((e & f) ^ (~e & g)) >>> 0;
    const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
    const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
    const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
    const t2 = (S0 + maj) >>> 0;
    h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
  H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
}

export function sha256Hex(bytes) {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const l = bytes.length;
  const bitLenLo = (l * 8) >>> 0;
  const bitLenHi = Math.floor((l * 8) / 4294967296);
  const paddedLen = ((l + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[l] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, bitLenHi, false);
  dv.setUint32(paddedLen - 4, bitLenLo, false);
  const w = new Uint32Array(64);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 8; i++) out += H[i].toString(16).padStart(8, '0');
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toB64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 == null ? 0 : b1) >> 4)];
    out += b1 == null ? '=' : B64[((b1 & 15) << 2) | ((b2 == null ? 0 : b2) >> 6)];
    out += b2 == null ? '=' : B64[b2 & 63];
  }
  return out;
}

/* hachage incrémental (classe Sha256Stream de crypto.ts) */
class Sha256Stream {
  static K = K;
  constructor() { this.H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]); this.buf = new Uint8Array(64); this.bufLen = 0; this.total = 0; this.w = new Uint32Array(64); }
  update(data) {
    this.total += data.length;
    let pos = 0;
    if (this.bufLen > 0) {
      const take = Math.min(64 - this.bufLen, data.length);
      this.buf.set(data.subarray(0, take), this.bufLen);
      this.bufLen += take; pos = take;
      if (this.bufLen === 64) { processBlock(this.H, this.buf, 0, this.w); this.bufLen = 0; }
    }
    while (pos + 64 <= data.length) { processBlock(this.H, data, pos, this.w); pos += 64; }
    if (pos < data.length) { this.buf.set(data.subarray(pos)); this.bufLen = data.length - pos; }
    return this;
  }
  hex() {
    const rem = this.bufLen;
    const padZeros = rem < 56 ? 56 - rem - 1 : 120 - rem - 1;
    const padded = new Uint8Array(rem + 1 + padZeros + 8);
    padded.set(this.buf.subarray(0, rem), 0);
    padded[rem] = 0x80;
    const pdv = new DataView(padded.buffer);
    pdv.setUint32(padded.length - 8, Math.floor((this.total * 8) / 4294967296), false);
    pdv.setUint32(padded.length - 4, ((this.total * 8) % 4294967296) >>> 0, false);
    for (let off = 0; off < padded.length; off += 64) processBlock(this.H, padded, off, this.w);
    let out = '';
    for (let i = 0; i < 8; i++) out += this.H[i].toString(16).padStart(8, '0');
    return out;
  }
}

/* ── tests ── */
const cases = [
  new TextEncoder().encode(''),
  new TextEncoder().encode('abc'),
  new TextEncoder().encode('MiMai — votre IA, votre appareil, vos données.'),
  new Uint8Array(64).map((_, i) => i),
  new Uint8Array(1000).map((_, i) => (i * 7 + 3) & 255),
  new Uint8Array(65536).map((_, i) => (i * 31 + 17) & 255),
  new Uint8Array(55),  // limite du padding (1 bloc - 9)
  new Uint8Array(56),  // force 2 blocs
  new Uint8Array(119), // force 3 blocs via incrémental
];
let ok = true;
for (const [i, b] of cases.entries()) {
  const want = createHash('sha256').update(Buffer.from(b)).digest('hex');
  const got = sha256Hex(b);
  if (want !== got) { ok = false; console.log(`sha256 KO cas ${i}: ${got} != ${want}`); }
  const b64want = Buffer.from(b).toString('base64');
  const b64got = toB64(b);
  if (b64want !== b64got) { ok = false; console.log(`base64 KO cas ${i}`); }
  /* incrémental : 1 à 17 morceaux */
  for (const parts of [2, 3, 7, 17]) {
    const inc = new Sha256Stream();
    const chunk = Math.max(1, Math.ceil(b.length / parts));
    for (let p = 0; p < b.length; p += chunk) inc.update(b.subarray(p, p + chunk));
    if (inc.hex() !== want) { ok = false; console.log(`incrémental KO cas ${i} (${parts} morceaux)`); }
  }
}
/* gros volume en morceaux de 1 Mo (simule un fichier de 50 Mo) */
{
  const big = new Uint8Array(50 * 1024 * 1024);
  for (let i = 0; i < big.length; i += 65536) big[i] = (i / 65536) & 255;
  const want = createHash('sha256').update(Buffer.from(big)).digest('hex');
  const inc = new Sha256Stream();
  const CH = 1 << 20;
  for (let p = 0; p < big.length; p += CH) inc.update(big.subarray(p, Math.min(big.length, p + CH)));
  if (inc.hex() !== want) { ok = false; console.log('incrémental 50 Mo KO'); }
}
console.log(ok ? 'ALL OK — sha256 one-shot + incrémental + base64 conformes' : 'ÉCHEC');
process.exit(ok ? 0 : 1);
