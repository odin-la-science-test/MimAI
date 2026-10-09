#!/usr/bin/env node
// Construit src/data/catalog.json à partir de scripts/catalog.curated.mjs.
//
//   npm run catalog:build                 (écrit src/data/catalog.json)
//   node scripts/build-catalog.mjs --out chemin.json   (sortie alternative, pour essais)
//
// RIEN n'est inventé : chaque entrée est vérifiée en ligne, sinon rejetée.
//  1. taille + sha256 : API Hugging Face /api/models/<repo>/tree/main (lfs.oid / lfs.size, pagination suivie)
//  2. dépôt public (ni gated, ni private, ni disabled) et URL resolve atteignable SANS authentification
//     (HEAD 200/302/307 + requête Range 206 dont le Content-Range total == lfs.size)
//  3. architecture GGUF (general.architecture), lue dans l'en-tête du fichier (Range sur les premiers Mo),
//     doit figurer dans la table LLM_ARCH_NAMES du llama.cpp embarqué dans node_modules/llama.rn
//  4. general.file_type (quantification réelle) lu dans l'en-tête et comparé à la quantification annoncée ;
//     <arch>.context_length lu dans l'en-tête -> champ ctx
//  5. licence lue dans les métadonnées du dépôt (cardData.license, sinon tag license:*, sinon licence du
//     modèle de base déclaré) ; sans licence lisible -> rejet
//  6. paramètres = gguf.total fourni par l'API HF (nombre de paramètres réel du GGUF)
//  7. le dépôt doit exposer un chat_template (modèle de chat) ; sinon rejet
//
// CLASSEMENT "rank" (1 = meilleur) : estimation éditoriale `score` (0-100, qualité attendue en chat sur
// téléphone, voir catalog.curated.mjs) moins une pénalité de quantification pour refléter le rapport
// qualité/taille : Q4_K_M/Q4_0 = 0, IQ4_XS = -0,5, Q5_K_M = -1, Q8_0 = -2 (même modèle, fichier plus gros).
// Égalités départagées par taille croissante puis id. Le tableau est écrit dans l'ordre du rank.
// C'est une estimation, pas un benchmark mesuré.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED, LEGACY } from './catalog.curated.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argOut = process.argv.indexOf('--out');
const OUT = argOut > 0 ? resolve(process.argv[argOut + 1]) : resolve(ROOT, 'src/data/catalog.json');
const MIN_BYTES = 0.28e9;
const MAX_BYTES = 4.85e9;
const CONCURRENCY = 4;
const UA = 'mimai-catalog-builder/1.0 (+verification des modeles GGUF)';
const HF = 'https://huggingface.co';

// ───────────────────────── réseau ─────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRetry(url, opts = {}, tries = 6) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        await res.arrayBuffer().catch(() => {});
        await sleep((Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500 * 2 ** i));
        lastErr = new Error('HTTP ' + res.status);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(1000 * 2 ** i);
    }
  }
  throw lastErr || new Error('échec réseau');
}

const cache = new Map();
const memo = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

function repoInfo(repo) {
  return memo('info:' + repo, async () => {
    const q = ['gguf', 'cardData', 'gated', 'tags', 'disabled', 'private'].map((x) => 'expand[]=' + x).join('&');
    const res = await fetchRetry(`${HF}/api/models/${repo}?${q}`);
    if (!res.ok) throw new Error(`API modèle HTTP ${res.status} (dépôt absent ou protégé)`);
    return res.json();
  });
}

function repoTree(repo) {
  return memo('tree:' + repo, async () => {
    let url = `${HF}/api/models/${repo}/tree/main`;
    const all = [];
    for (let page = 0; url && page < 30; page++) {
      const res = await fetchRetry(url);
      if (!res.ok) throw new Error(`API tree HTTP ${res.status}`);
      all.push(...(await res.json()));
      const link = res.headers.get('link') || '';
      const m = link.match(/<([^>]+)>;\s*rel="next"/);
      url = m ? m[1] : null;
    }
    return all;
  });
}

// ───────────────────────── GGUF ─────────────────────────
const FTYPE = {
  0: 'F32', 1: 'F16', 2: 'Q4_0', 3: 'Q4_1', 7: 'Q8_0', 8: 'Q5_0', 9: 'Q5_1', 10: 'Q2_K', 11: 'Q3_K_S', 12: 'Q3_K_M',
  13: 'Q3_K_L', 14: 'Q4_K_S', 15: 'Q4_K_M', 16: 'Q5_K_S', 17: 'Q5_K_M', 18: 'Q6_K', 19: 'IQ2_XXS', 20: 'IQ2_XS',
  21: 'Q2_K_S', 22: 'IQ3_XS', 23: 'IQ3_XXS', 24: 'IQ1_S', 25: 'IQ4_NL', 26: 'IQ3_S', 27: 'IQ3_M', 28: 'IQ2_S',
  29: 'IQ2_M', 30: 'IQ4_XS', 31: 'IQ1_M', 32: 'BF16',
};
class NeedMore extends Error {}

/** Parseur GGUF v2/v3 minimal : s'arrête dès que architecture, file_type et context_length sont connus. */
function parseGgufHeader(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 0;
  const need = (n) => { if (p + n > buf.length) throw new NeedMore(); };
  const u32 = () => { need(4); const v = dv.getUint32(p, true); p += 4; return v; };
  const u64 = () => { need(8); const v = Number(dv.getBigUint64(p, true)); p += 8; return v; };
  const str = () => {
    const n = u64();
    need(n);
    const s = new TextDecoder().decode(buf.subarray(p, p + n));
    p += n;
    return s;
  };
  const SIZES = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };
  const scalar = (t) => {
    need(SIZES[t]);
    let v;
    switch (t) {
      case 0: v = dv.getUint8(p); break;
      case 1: v = dv.getInt8(p); break;
      case 2: v = dv.getUint16(p, true); break;
      case 3: v = dv.getInt16(p, true); break;
      case 4: v = dv.getUint32(p, true); break;
      case 5: v = dv.getInt32(p, true); break;
      case 6: v = dv.getFloat32(p, true); break;
      case 7: v = dv.getUint8(p) !== 0; break;
      case 10: v = Number(dv.getBigUint64(p, true)); break;
      case 11: v = Number(dv.getBigInt64(p, true)); break;
      case 12: v = dv.getFloat64(p, true); break;
    }
    p += SIZES[t];
    return v;
  };
  const skip = (t) => {
    if (t === 8) { str(); return; }
    if (t === 9) {
      const et = u32();
      const n = u64();
      if (et === 8) { for (let i = 0; i < n; i++) str(); } else { need(n * SIZES[et]); p += n * SIZES[et]; }
      return;
    }
    need(SIZES[t]); p += SIZES[t];
  };
  need(24);
  if (dv.getUint32(0, true) !== 0x46554747) throw new Error('magic GGUF absent');
  p = 4;
  const version = u32();
  if (version < 2 || version > 3) throw new Error('version GGUF non gérée : ' + version);
  u64(); // tensor_count
  const kv = u64();
  const out = { version };
  let ctxKey = null;
  for (let i = 0; i < kv; i++) {
    const key = str();
    const t = u32();
    if (key === 'general.architecture') { out.arch = str(); ctxKey = out.arch + '.context_length'; }
    else if (key === 'general.file_type') { out.fileType = scalar(t); }
    else if (key === 'general.size_label') { out.sizeLabel = str(); }
    else if (ctxKey && key === ctxKey) { out.ctx = scalar(t); }
    else if (key.endsWith('.context_length') && !ctxKey) { out.ctxEarly = scalar(t); }
    else skip(t);
    if (out.arch && out.fileType !== undefined && (out.ctx !== undefined)) return out;
  }
  if (out.ctx === undefined && out.ctxEarly !== undefined) out.ctx = out.ctxEarly;
  return out;
}

async function readGguf(url, expectedSize) {
  let want = 2 * 1024 * 1024;
  for (;;) {
    const res = await fetchRetry(url, { headers: { Range: `bytes=0-${want - 1}` } });
    if (res.status !== 206 && res.status !== 200) throw new Error(`Range HTTP ${res.status}`);
    const cr = res.headers.get('content-range') || '';
    const m = cr.match(/\/(\d+)$/);
    const total = m ? Number(m[1]) : null;
    if (res.status === 200 && want > expectedSize) { /* serveur sans Range : fichier entier */ }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (total !== null && total !== expectedSize) throw new Error(`taille serveur ${total} != API ${expectedSize}`);
    try {
      const head = parseGgufHeader(buf);
      return { ...head, contentRangeTotal: total, headBytes: buf.length };
    } catch (e) {
      if (!(e instanceof NeedMore)) throw e;
      if (want >= 40 * 1024 * 1024 || buf.length < want) throw new Error('en-tête GGUF incomplet / trop grand');
      want *= 2;
    }
  }
}

// ───────────────────────── architectures supportées ─────────────────────────
function loadSupportedArchs() {
  const f = resolve(ROOT, 'node_modules/llama.rn/vendor/llama.cpp/src/llama-arch.cpp');
  if (!existsSync(f)) throw new Error('llama-arch.cpp introuvable : lancez npm install');
  const txt = readFileSync(f, 'utf8');
  const set = new Set();
  for (const m of txt.matchAll(/\{\s*LLM_ARCH_[A-Z0-9_]+\s*,\s*"([^"]+)"\s*\}/g)) set.add(m[1]);
  if (set.size < 30) throw new Error('table LLM_ARCH_NAMES non reconnue');
  return set;
}

// ───────────────────────── licences ─────────────────────────
const LICENSE_ID = {
  'apache-2.0': 'Apache-2.0', mit: 'MIT', 'bsd-3-clause': 'BSD-3-Clause', 'cc-by-4.0': 'CC-BY-4.0',
  'cc-by-nc-4.0': 'CC-BY-NC-4.0', 'cc-by-nc-sa-4.0': 'CC-BY-NC-SA-4.0',
  'llama3.2': 'Llama-3.2', 'llama3.1': 'Llama-3.1', llama3: 'Llama-3', llama2: 'Llama-2', gemma: 'Gemma',
};
const FREE = new Set(['Apache-2.0', 'MIT', 'BSD-3-Clause']);

function licenseOf(info) {
  const c = info.cardData || {};
  let id = typeof c.license === 'string' ? c.license : Array.isArray(c.license) ? c.license[0] : null;
  if (!id) {
    const t = (info.tags || []).find((x) => x.startsWith('license:'));
    if (t) id = t.slice(8);
  }
  if (!id) return null;
  return { raw: id, name: c.license_name || null, link: c.license_link || null };
}

function licenseFields(repo, lic, viaBase) {
  const spdx = LICENSE_ID[lic.raw] || (lic.raw === 'other' && lic.name ? lic.name : lic.raw);
  let note;
  if (FREE.has(spdx)) note = undefined;
  else if (spdx === 'CC-BY-4.0') note = 'Attribution requise (CC-BY-4.0).';
  else if (/^CC-BY-NC/.test(spdx)) note = 'Usage non commercial uniquement (licence CC-BY-NC).';
  else if (/^Llama/.test(spdx)) note = 'Licence communautaire Meta (Llama) : conditions d\'utilisation à accepter et à respecter ; ce n\'est pas une licence libre standard.';
  else if (spdx === 'Gemma') note = 'Conditions d\'utilisation Gemma de Google à accepter et à respecter ; ce n\'est pas une licence libre standard.';
  else {
    let link = lic.link;
    if (link && !/^https?:/.test(link)) link = `${HF}/${repo}/blob/main/${link}`;
    note = `Licence « ${spdx} » à conditions particulières : lire le texte avant tout usage, notamment commercial${link ? ' (' + link + ')' : ' (voir la page du dépôt)'}.`;
  }
  if (viaBase) note = (note ? note + ' ' : '') + `Licence lue sur le modèle de base ${viaBase}.`;
  return { license: spdx, licenseNote: note };
}

async function resolveLicense(repo, info) {
  let lic = licenseOf(info);
  if (lic) return licenseFields(repo, lic, null);
  const bm = info.cardData && info.cardData.base_model;
  const bases = Array.isArray(bm) ? bm : bm ? [bm] : [];
  for (const b of bases) {
    if (typeof b !== 'string') continue;
    try {
      const bi = await repoInfo(b);
      lic = licenseOf(bi);
      if (lic) return licenseFields(repo, lic, b);
    } catch { /* suivant */ }
  }
  return null;
}

// ───────────────────────── mise en forme ─────────────────────────
const fr = (n) => String(n).replace('.', ',');
function paramsFromTotal(total) {
  const b = total / 1e9;
  const v = b >= 1 ? Math.round(b * 10) / 10 : Math.round(b * 100) / 100;
  return { paramsB: v, paramsLabel: fr(v) + ' B' };
}
function ctxLabel(n) {
  if (n >= 1048576 && n % 1048576 === 0) return n / 1048576 + 'M';
  if (n % 1024 === 0) return n / 1024 + 'K';
  return Math.round(n / 1000) + 'K';
}
const needRam = (size) => Math.round(((size * 1.15 + 0.7e9) / 1e9) * 10) / 10;
const QUANT_NOTE = {
  Q4_K_M: null,
  Q4_0: 'quantification Q4_0 : format simple et rapide, un peu moins précis que Q4_K_M',
  IQ4_XS: 'quantification IQ4_XS : plus compacte que Q4_K_M, un peu plus lente à calculer',
  Q5_K_M: 'quantification Q5_K_M : un peu plus fidèle que Q4_K_M, un peu plus volumineuse',
  Q8_0: 'quantification Q8_0 : fidélité maximale, fichier environ deux fois plus gros que Q4_K_M',
};
const QUANT_PENALTY = { Q4_K_M: 0, Q4_0: 0, IQ4_XS: 0.5, Q5_K_M: 1, Q8_0: 2 };

function kebab(s) {
  return s.toLowerCase().replace(/[^a-z0-9._]+/g, '-').replace(/^-+|-+$/g, '');
}

// ───────────────────────── vérification d'une entrée ─────────────────────────
function findFile(tree, entry, quant) {
  if (entry.files && entry.files[quant]) {
    const f = tree.find((e) => e.type === 'file' && e.path === entry.files[quant]);
    if (!f) throw new Error('fichier explicite absent du dépôt : ' + entry.files[quant]);
    return f;
  }
  const re = new RegExp(`[-_.]${quant}\\.gguf$`, 'i');
  const c = tree.filter((e) => e.type === 'file' && re.test(e.path) && !/mmproj/i.test(e.path) && !/-of-\d+\.gguf$/i.test(e.path));
  if (c.length === 0) throw new Error(`aucun fichier ${quant} (non fractionné) dans le dépôt`);
  if (c.length > 1) throw new Error(`ambigu : ${c.map((x) => x.path).join(', ')}`);
  return c[0];
}

async function verify(entry, quant, archs) {
  const repo = entry.repo;
  const info = await repoInfo(repo);
  if (info.private || info.disabled) throw new Error('dépôt privé/désactivé');
  if (info.gated) throw new Error('dépôt protégé (gated=' + info.gated + ')');
  const tree = await repoTree(repo);
  const f = findFile(tree, entry, quant);
  const size = f.lfs ? f.lfs.size : null;
  const sha = f.lfs ? f.lfs.oid : null;
  if (!Number.isInteger(size) || size <= 0) throw new Error('taille LFS absente');
  if (!/^[0-9a-f]{64}$/.test(sha || '')) throw new Error('sha256 LFS absent');
  if (size < MIN_BYTES || size > MAX_BYTES) throw new Error(`taille hors plage (${(size / 1e9).toFixed(2)} Go)`);
  const url = `${HF}/${repo}/resolve/main/${f.path.split('/').map(encodeURIComponent).join('/')}`;
  const head = await fetchRetry(url, { method: 'HEAD', redirect: 'manual' });
  if (![200, 302, 307].includes(head.status)) throw new Error('URL resolve HTTP ' + head.status + ' sans authentification');
  const g = await readGguf(url, size);
  if (!archs.has(g.arch)) throw new Error(`architecture GGUF « ${g.arch} » non supportée par llama.cpp embarqué`);
  const realQuant = g.fileType !== undefined ? FTYPE[g.fileType] : null;
  if (realQuant && realQuant !== quant) throw new Error(`file_type GGUF = ${realQuant} (annoncé ${quant})`);
  const gg = info.gguf || {};
  if (!gg.chat_template) throw new Error('pas de chat_template (pas un modèle de chat)');
  if (!Number.isFinite(gg.total) || gg.total <= 0) throw new Error('nombre de paramètres indisponible (API gguf.total)');
  const ctx = g.ctx ?? gg.context_length;
  if (!Number.isFinite(ctx) || ctx <= 0) throw new Error('contexte natif illisible');
  const lic = await resolveLicense(repo, info);
  if (!lic) throw new Error('licence illisible dans les métadonnées du dépôt');
  return { f, size, sha, url, g, ctx, ctxSource: g.ctx !== undefined ? 'en-tête GGUF' : 'API HF', total: gg.total, lic, realQuant };
}

function buildModel(entry, quant, v) {
  const legacyId = entry.legacy && entry.legacy.includes(quant) ? entry.ids[quant] : null;
  if (legacyId) {
    const L = LEGACY.find((x) => x.id === legacyId);
    if (v.size !== L.sizeBytes || v.sha !== L.sha256 || v.f.path !== L.file || v.url !== L.url || entry.repo !== L.repo) {
      throw Object.assign(new Error(`ENTRÉE HISTORIQUE ${legacyId} : valeurs vérifiées différentes de la graine`), { fatal: true });
    }
    return { ...L };
  }
  const id = (entry.ids && entry.ids[quant]) || `${kebab(entry.slug)}-${quant.toLowerCase()}`;
  let { paramsB, paramsLabel } = paramsFromTotal(v.total);
  if (entry.legacy) {
    // même modèle que l'entrée historique : on garde son libellé de paramètres (nominal) pour rester cohérent
    ({ paramsB, paramsLabel } = LEGACY.find((x) => x.id === entry.ids[entry.legacy[0]]));
  }
  const tags = new Set((entry.tags || []).filter((t) => t !== 'leger' && t !== 'long-contexte'));
  if (v.size < 1.3e9) tags.add('leger');
  if (v.ctx >= 65536) tags.add('long-contexte');
  const note = QUANT_NOTE[quant];
  const base = entry.explain.replace(/\.$/, '');
  const m = {
    id,
    name: entry.name,
    family: entry.family,
    paramsB,
    paramsLabel,
    quant,
    ctx: ctxLabel(v.ctx),
    license: v.lic.license,
  };
  if (v.lic.licenseNote) m.licenseNote = v.lic.licenseNote;
  m.tags = [...tags];
  m.explain = note ? `${base} (${note}).` : base + '.';
  m.sizeBytes = v.size;
  m.sha256 = v.sha;
  m.file = v.f.path;
  m.url = v.url;
  m.repo = entry.repo;
  m.needRamGb = needRam(v.size);
  return m;
}

// ───────────────────────── principal ─────────────────────────
async function pool(items, worker, n) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      results[k] = await worker(items[k]);
    }
  }));
  return results;
}

async function main() {
  const archs = loadSupportedArchs();
  console.log(`Architectures supportées par llama.cpp embarqué : ${archs.size}`);
  const jobs = [];
  for (const e of CURATED) {
    const quants = [...new Set([...(e.quants || []), ...Object.keys(e.files || {})])];
    for (const q of quants) jobs.push({ entry: e, quant: q });
  }
  console.log(`Candidats : ${jobs.length} (${CURATED.length} modèles)`);
  let done = 0;
  const results = await pool(jobs, async (job) => {
    try {
      const v = await verify(job.entry, job.quant, archs);
      const model = buildModel(job.entry, job.quant, v);
      done++;
      if (done % 10 === 0) console.log(`  ... ${done}/${jobs.length}`);
      return { job, model, v, score: job.entry.score - (QUANT_PENALTY[job.quant] ?? 1) };
    } catch (e) {
      done++;
      if (e.fatal) throw e;
      return { job, error: e.message };
    }
  }, CONCURRENCY);

  const ok = results.filter((r) => r.model);
  const ko = results.filter((r) => r.error);

  // unicité des ids et des (repo, file)
  const ids = new Set();
  const rf = new Set();
  for (const r of ok) {
    if (ids.has(r.model.id)) throw new Error('id en double : ' + r.model.id);
    ids.add(r.model.id);
    const k = r.model.repo + '|' + r.model.file;
    if (rf.has(k)) throw new Error('(repo,file) en double : ' + k);
    rf.add(k);
  }
  for (const L of LEGACY) if (!ids.has(L.id)) throw new Error('id historique manquant après vérification : ' + L.id);

  ok.sort((a, b) => b.score - a.score || a.model.sizeBytes - b.model.sizeBytes || a.model.id.localeCompare(b.model.id));
  const models = ok.map((r, i) => ({ ...r.model, rank: i + 1 }));

  const catalog = { schema: 1, generatedAt: new Date().toISOString(), models };
  mkdirSync(dirname(OUT), { recursive: true });
  const tmp = OUT + '.tmp-' + process.pid;
  writeFileSync(tmp, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  renameSync(tmp, OUT);

  // ── résumé ──
  console.log('\n===== RÉSUMÉ =====');
  console.log(`Candidats : ${jobs.length} | retenus : ${ok.length} | rejetés : ${ko.length}`);
  const byFam = {};
  for (const m of models) byFam[m.family] = (byFam[m.family] || 0) + 1;
  console.log('Par famille :', Object.entries(byFam).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', '));
  const tiers = [['< 1 Go', 0, 1e9], ['1-2 Go', 1e9, 2e9], ['2-3 Go', 2e9, 3e9], ['3-4 Go', 3e9, 4e9], ['4-4,85 Go', 4e9, 5e9]];
  console.log('Par taille  :', tiers.map(([l, a, b]) => `${l} ${models.filter((m) => m.sizeBytes >= a && m.sizeBytes < b).length}`).join(', '));
  const lic = {};
  for (const m of models) lic[m.license] = (lic[m.license] || 0) + 1;
  console.log('Licences    :', Object.entries(lic).map(([k, n]) => `${k} ${n}`).join(', '));
  const ctxFromApi = ok.filter((r) => r.v.ctxSource !== 'en-tête GGUF').length;
  console.log(`Contexte lu dans l'en-tête GGUF : ${ok.length - ctxFromApi}/${ok.length} (reste : API HF)`);
  if (ko.length) {
    console.log('\nREJETÉS :');
    for (const r of ko) console.log(`  - ${r.job.entry.repo} [${r.job.quant}] : ${r.error}`);
  }
  console.log(`\nÉcrit : ${OUT}`);
}

main().catch((e) => {
  console.error('ÉCHEC :', e.message);
  process.exit(1);
});
