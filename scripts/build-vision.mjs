#!/usr/bin/env node
// Construit src/data/vision.json : modèles capables de VOIR les images (modèle + fichier « mmproj »).
//
//   npm run vision:build
//
// Comme pour le catalogue principal, RIEN n'est inventé : chaque fichier (modèle ET mmproj) est vérifié en ligne.
//  1. taille + sha256 : API Hugging Face /api/models/<repo>/tree/main (lfs.oid / lfs.size)
//  2. dépôt public (ni gated, ni private, ni disabled) ; URL resolve atteignable sans authentification
//     (requête Range 206 dont le Content-Range total == lfs.size)
//  3. licence, architecture, contexte et chat_template lus dans les métadonnées du dépôt (API /api/models/<repo>)
// Les choix éditoriaux (quel dépôt, quel fichier, nom, explication) sont ci-dessous ; aucune valeur technique n'y figure.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/data/vision.json');
const HF = 'https://huggingface.co';
const UA = 'mimai-vision-builder/1.0';

const VISION = [
  { id: 'smolvlm2-500m-q8_0', repo: 'ggml-org/SmolVLM2-500M-Video-Instruct-GGUF', family: 'SmolVLM', name: 'SmolVLM2 500M (vision)',
    file: 'SmolVLM2-500M-Video-Instruct-Q8_0.gguf', mmproj: 'mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf', quant: 'Q8_0', score: 60,
    tags: ['vision', 'leger', 'multilingue'],
    explain: 'Le plus léger des modèles de vision : décrit une photo ou lit un texte court, sur presque tous les téléphones. Moins précis que les grands.' },
  { id: 'qwen2.5-vl-3b-q4_k_m', repo: 'ggml-org/Qwen2.5-VL-3B-Instruct-GGUF', family: 'Qwen', name: 'Qwen 2.5 VL 3B (vision)',
    file: 'Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf', mmproj: 'mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf', quant: 'Q4_K_M', score: 82,
    tags: ['vision', 'multilingue', 'francais', 'long-contexte'],
    licenseOverride: 'qwen-research',
    licenseNote: 'Le dépôt de conversion indique Apache-2.0, mais la licence du modèle Qwen2.5-VL 3B d’origine (Qwen Research) fait foi : vérifiez-la avant tout usage commercial.',
    explain: 'Très bon pour lire du texte dans une image, des documents ou des captures d’écran. Demande un téléphone de 8 Go.' },
  { id: 'gemma3-4b-vision-q4_k_m', repo: 'ggml-org/gemma-3-4b-it-GGUF', family: 'Gemma', name: 'Gemma 3 4B (vision)',
    file: 'gemma-3-4b-it-Q4_K_M.gguf', mmproj: 'mmproj-model-f16.gguf', quant: 'Q4_K_M', score: 88,
    tags: ['vision', 'multilingue', 'francais', 'long-contexte', 'precis'],
    explain: 'Le plus à l’aise en français et le plus précis pour décrire une scène, mais lourd (3,3 Go) : réservé aux téléphones de 8 Go.' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, opts = {}, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
      if (res.status === 429 || res.status >= 500) { last = new Error('HTTP ' + res.status); await sleep(1500 * 2 ** i); continue; }
      return res;
    } catch (e) { last = e; await sleep(1000 * 2 ** i); }
  }
  throw last;
}
const fmtParams = b => String(Math.round(b * 10) / 10).replace('.', ',') + ' B';
const fmtCtx = n => (n >= 1000 ? Math.round(n / 1024) + 'K' : String(n));

async function verifyFile(repo, tree, name) {
  const f = tree.find(x => x.path === name);
  if (!f || !f.lfs || !f.lfs.oid || !f.lfs.size) throw new Error(repo + ' : fichier LFS introuvable ' + name);
  const url = HF + '/' + repo + '/resolve/main/' + name;
  const r = await get(url, { headers: { Range: 'bytes=0-1' }, redirect: 'follow' });
  await r.arrayBuffer().catch(() => {});
  const total = Number((r.headers.get('content-range') || '').split('/')[1]);
  if (r.status !== 206 || total !== f.lfs.size) throw new Error(repo + ' : ' + name + ' inaccessible sans authentification ou taille différente (' + r.status + ', ' + total + ' vs ' + f.lfs.size + ')');
  return { file: name, url, sizeBytes: f.lfs.size, sha256: f.lfs.oid };
}

const models = [];
for (const v of VISION) {
  const info = await (await get(HF + '/api/models/' + v.repo)).json();
  if (info.gated || info.private || info.disabled) throw new Error(v.repo + ' : dépôt non public');
  const tree = await (await get(HF + '/api/models/' + v.repo + '/tree/main')).json();
  const main = await verifyFile(v.repo, tree, v.file);
  const proj = await verifyFile(v.repo, tree, v.mmproj);
  const g = info.gguf || {};
  if (!g.chat_template) throw new Error(v.repo + ' : pas de chat_template');
  const license = v.licenseOverride || (info.cardData && info.cardData.license) || (info.tags || []).find(t => t.startsWith('license:'))?.slice(8);
  if (!license) throw new Error(v.repo + ' : licence illisible');
  const LIC = { 'apache-2.0': 'Apache-2.0', gemma: 'Gemma', mit: 'MIT' };
  const total = main.sizeBytes + proj.sizeBytes;
  models.push({
    id: v.id, name: v.name, family: v.family, paramsB: Math.round((g.total || 0) / 1e8) / 10, paramsLabel: fmtParams((g.total || 0) / 1e9),
    quant: v.quant, ctx: fmtCtx(g.context_length || 8192), license: LIC[license] || license, ...(v.licenseNote ? { licenseNote: v.licenseNote } : {}),
    tags: v.tags, explain: v.explain, sizeBytes: main.sizeBytes, sha256: main.sha256, file: main.file, url: main.url, repo: v.repo,
    needRamGb: Math.round(((total * 1.15 + 0.7e9) / 1e9) * 10) / 10,
    rank: 0, score: v.score,
    mmproj: proj,
  });
  console.log('OK', v.id, (total / 1e9).toFixed(2) + ' Go', license, g.architecture, fmtCtx(g.context_length || 0));
}
models.sort((a, b) => b.score - a.score);
models.forEach((m, i) => { m.rank = 130 + i; delete m.score; });   // après les 129 modèles du catalogue de texte
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), models }, null, 2) + '\n');
console.log('écrit', OUT, models.length, 'modèles');
