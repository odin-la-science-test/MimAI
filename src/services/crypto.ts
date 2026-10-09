/* MiMai — pont crypto.
   Build Android (production) : react-native-quick-crypto fournit AES-256-GCM
   et le hachage en flux (clé dans SecureStore → Android Keystore).
   Expo Go (test) : modules natifs absents → repli JS pur : SHA-256 implémenté
   localement (validé contre la référence, scripts/sha256-check.mjs) et
   chiffrement au repos désactivé proprement (données de test en clair). */
import * as SecureStore from 'expo-secure-store';
import * as ExpoCrypto from 'expo-crypto';

/* ── modules natifs, chargés défensivement ── */
let QC: any = null;
let QBuffer: any = null;
try {
  QC = require('react-native-quick-crypto');
  QBuffer = QC?.Buffer || (globalThis as { Buffer?: unknown }).Buffer || null;
} catch { QC = null; }

export const cryptoMode: 'native' | 'js' = QC ? 'native' : 'js';

/* ── SHA-256 JS pur (validé, voir scripts/sha256-check.mjs) ── */
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
const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

function processBlock(H: Uint32Array, block: Uint8Array, off: number, w: Uint32Array): void {
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

/* hachage incrémental : update() par blocs (fichiers de plusieurs Go), hex() final */
export class Sha256Stream {
  private H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  private buf = new Uint8Array(64);
  private bufLen = 0;
  private total = 0;
  private w = new Uint32Array(64);

  update(data: Uint8Array): this {
    this.total += data.length;
    let pos = 0;
    if (this.bufLen > 0) {
      const need = 64 - this.bufLen;
      const take = Math.min(need, data.length);
      this.buf.set(data.subarray(0, take), this.bufLen);
      this.bufLen += take;
      pos = take;
      if (this.bufLen === 64) { processBlock(this.H, this.buf, 0, this.w); this.bufLen = 0; }
    }
    while (pos + 64 <= data.length) { processBlock(this.H, data, pos, this.w); pos += 64; }
    if (pos < data.length) { this.buf.set(data.subarray(pos)); this.bufLen = data.length - pos; }
    return this;
  }

  hex(): string {
    /* padding final : 0x80, zéros, longueur en bits sur 8 octets big-endian */
    const rem = this.bufLen; /* = total % 64 */
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

export function sha256Hex(bytes: Uint8Array): string {
  const h = new Sha256Stream();
  h.update(bytes);
  return h.hex();
}

/* ── base64 JS pur ── */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toB64(bytes: Uint8Array): string {
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

/* ── empreinte d'un fichier téléchargé (flux, taille quelconque) ── */
const tick = () => new Promise<void>(r => setTimeout(r, 0));

export async function sha256OfFile(uri: string, fileSize: number, readChunk: (pos: number, len: number) => Promise<string>, onProgress?: (pct: number) => void): Promise<string> {
  if (QC && QBuffer) {
    const h = QC.createHash('sha256');
    const upd = h.update.bind(h) as (d: unknown) => void;
    const CHUNK = 1 << 20;
    for (let pos = 0; pos < fileSize; pos += CHUNK) {
      const len = Math.min(CHUNK, fileSize - pos);
      upd(QBuffer.from(await readChunk(pos, len), 'base64'));
      onProgress?.(Math.min(100, ((pos + len) / fileSize) * 100));
      await tick();
    }
    return h.digest('hex');
  }
  /* Expo Go : SHA-256 JS incrémental par blocs de 1 Mo (multiple de 3 octets) */
  const CH = 1048575;
  const js = new Sha256Stream();
  for (let pos = 0; pos < fileSize; pos += CH) {
    const len = Math.min(CH, fileSize - pos);
    js.update(b64ToBytes(await readChunk(pos, len)));
    onProgress?.(Math.min(100, ((pos + len) / fileSize) * 100));
    await tick();
  }
  return js.hex();
}

/* Voie rapide : lecture d'OCTETS directement depuis un FileHandle (expo-file-system), sans base64 ni décodage JS.
   Blocs de 4 Mo, hachage natif (quick-crypto) si disponible, sinon SHA-256 JS ; progression réelle + pauses pour l'interface. */
export async function sha256OfHandle(fileSize: number, handle: { readBytes(n: number): Uint8Array }, onProgress?: (pct: number) => void): Promise<string> {
  const CHUNK = 4 << 20;
  const h = QC ? QC.createHash('sha256') : null;
  const js = h ? null : new Sha256Stream();
  let done = 0;
  while (done < fileSize) {
    const bytes = handle.readBytes(Math.min(CHUNK, fileSize - done));
    if (!bytes.length) break; /* fin inattendue : la taille sera de toute façon rejetée plus haut */
    if (h) h.update(bytes); else js!.update(bytes);
    done += bytes.length;
    onProgress?.(Math.min(100, (done / fileSize) * 100));
    await tick();
  }
  return h ? h.digest('hex') : js!.hex();
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const idx = (c: string) => { const j = A.indexOf(c); return j < 0 ? 0 : j; };
    const n = (idx(clean[i]) << 18) | (idx(clean[i + 1]) << 12) | (idx(clean[i + 2]) << 6) | idx(clean[i + 3]);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/* ── chiffrement au repos (AES-256-GCM, build natif) ── */
const KEY_NAME = 'mimai.dbkey.v1';
let keyPromise: Promise<unknown | null> | null = null;

/* Clé AES-256 : générée une seule fois, stockée dans SecureStore (Android Keystore).
   Si le Keystore est momentanément indisponible, on LÈVE une erreur au lieu de
   générer une nouvelle clé (ce qui rendrait toutes les données illisibles). */
async function createKey(): Promise<unknown | null> {
  if (!QC || !QBuffer) return null;
  let b64: string | null = await SecureStore.getItemAsync(KEY_NAME);
  if (!b64) {
    const raw = new Uint8Array(32);
    ExpoCrypto.getRandomValues(raw);
    b64 = toB64(raw);
    await SecureStore.setItemAsync(KEY_NAME, b64, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  }
  return QBuffer.from(b64, 'base64');
}

function loadKey(): Promise<unknown | null> {
  if (!keyPromise) {
    keyPromise = createKey().catch(err => { keyPromise = null; throw err; });
  }
  return keyPromise;
}

export async function encryptText(plain: string): Promise<string> {
  const key = await loadKey();
  if (!key || !QC || !QBuffer) return plain; /* Expo Go : en clair, signalé dans l'app */
  const iv = QBuffer.from(ExpoCrypto.getRandomValues(new Uint8Array(12)));
  const cipher = QC.createCipheriv('aes-256-gcm', key, iv);
  const enc = QBuffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc1:' + iv.toString('base64') + ':' + tag.toString('base64') + ':' + enc.toString('base64');
}

export async function decryptText(box: string): Promise<string> {
  if (!box.startsWith('enc1:')) return box;
  const key = await loadKey();
  if (!key || !QC || !QBuffer) return box;
  const [, ivB, tagB, dataB] = box.split(':');
  const decipher = QC.createDecipheriv('aes-256-gcm', key, QBuffer.from(ivB, 'base64'));
  decipher.setAuthTag(QBuffer.from(tagB, 'base64'));
  const dec = QBuffer.concat([decipher.update(QBuffer.from(dataB, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}
