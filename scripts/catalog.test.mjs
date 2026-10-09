// Validation hors ligne de src/data/catalog.json  ->  npm run catalog:check
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(resolve(ROOT, 'src/data/catalog.json'), 'utf8'));
const models = catalog.models;

// Ids historiques stockés chez les utilisateurs : valeurs figées (copie volontairement indépendante du build).
const HISTORIC = {
  qwen05b: {
    name: 'Qwen 2.5 0.5B Instruct', family: 'Qwen', paramsB: 0.5, paramsLabel: '0,5 B', quant: 'Q4_K_M', ctx: '32K',
    license: 'Apache-2.0', tags: ['francais', 'leger'], sizeBytes: 491400032,
    sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
    file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    repo: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF', needRamGb: 1.3,
  },
  smollm17b: {
    name: 'SmolLM2 1.7B Instruct', family: 'SmolLM', paramsB: 1.7, paramsLabel: '1,7 B', quant: 'Q4_K_M', ctx: '8K',
    license: 'Apache-2.0', tags: ['equilibre'], sizeBytes: 1055609536,
    sha256: 'decd2598bc2c8ed08c19adc3c8fdd461ee19ed5708679d1c54ef54a5a30d4f33',
    file: 'smollm2-1.7b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf',
    repo: 'HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF', needRamGb: 1.9,
  },
  qwen15b: {
    name: 'Qwen 2.5 1.5B Instruct', family: 'Qwen', paramsB: 1.5, paramsLabel: '1,5 B', quant: 'Q4_K_M', ctx: '32K',
    license: 'Apache-2.0', tags: ['francais', 'precis'], sizeBytes: 1117320736,
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
    file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF', needRamGb: 2,
  },
};

const TAGS = new Set(['francais', 'multilingue', 'code', 'raisonnement', 'leger', 'equilibre', 'precis', 'long-contexte', 'maths']);
const needRam = (s) => Math.round(((s * 1.15 + 0.7e9) / 1e9) * 10) / 10;
const isStr = (v) => typeof v === 'string' && v.length > 0;

test('en-tête du catalogue', () => {
  assert.equal(catalog.schema, 1);
  assert.ok(!Number.isNaN(Date.parse(catalog.generatedAt)), 'generatedAt ISO');
  assert.ok(Array.isArray(models) && models.length > 0);
});

test('schéma de chaque modèle', () => {
  for (const m of models) {
    const w = `[${m.id}]`;
    for (const k of ['id', 'name', 'family', 'paramsLabel', 'quant', 'ctx', 'license', 'explain', 'file', 'url', 'repo']) {
      assert.ok(isStr(m[k]), `${w} champ texte « ${k} » manquant`);
    }
    assert.match(m.id, /^[a-z0-9][a-z0-9._-]*$/, `${w} id non kebab-case`);
    assert.ok(typeof m.paramsB === 'number' && m.paramsB > 0 && m.paramsB < 20, `${w} paramsB`);
    assert.match(m.paramsLabel, /^\d+(,\d+)? B$/, `${w} paramsLabel`);
    assert.match(m.ctx, /^\d+[KM]$/, `${w} ctx`);
    assert.ok(Array.isArray(m.tags) && m.tags.every((t) => TAGS.has(t)), `${w} tags`);
    assert.equal(new Set(m.tags).size, m.tags.length, `${w} tags en double`);
    assert.ok(m.licenseNote === undefined || isStr(m.licenseNote), `${w} licenseNote`);
    assert.ok(Number.isInteger(m.sizeBytes) && m.sizeBytes > 0, `${w} sizeBytes`);
    assert.match(m.sha256, /^[0-9a-f]{64}$/, `${w} sha256`);
    assert.ok(m.file.endsWith('.gguf') && !/mmproj/i.test(m.file), `${w} file`);
    assert.ok(m.url.startsWith('https://huggingface.co/'), `${w} url hors huggingface.co`);
    assert.equal(m.url, `https://huggingface.co/${m.repo}/resolve/main/${m.file.split('/').map(encodeURIComponent).join('/')}`, `${w} url incohérente avec repo/file`);
    assert.ok(Math.abs(m.needRamGb - needRam(m.sizeBytes)) < 0.051, `${w} needRamGb ${m.needRamGb} != ${needRam(m.sizeBytes)}`);
    assert.ok(Number.isInteger(m.rank) && m.rank >= 1, `${w} rank`);
    assert.ok(m.sizeBytes >= 0.25e9 && m.sizeBytes <= 5e9, `${w} taille hors plage téléphone`);
  }
});

test('unicité des ids, des rangs et des (repo, file)', () => {
  const ids = models.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'ids en double');
  const rf = models.map((m) => m.repo + '|' + m.file);
  assert.equal(new Set(rf).size, rf.length, '(repo,file) en double');
  const ranks = models.map((m) => m.rank).sort((a, b) => a - b);
  assert.deepEqual(ranks, ranks.map((_, i) => i + 1), 'rank doit être 1..N sans trou');
  for (let i = 1; i < models.length; i++) assert.ok(models[i - 1].rank < models[i].rank, 'models trié par rank');
});

test('ids historiques inchangés', () => {
  for (const [id, expected] of Object.entries(HISTORIC)) {
    const m = models.find((x) => x.id === id);
    assert.ok(m, `id historique ${id} absent`);
    const { rank, explain, ...rest } = m;
    assert.ok(isStr(explain));
    assert.deepEqual(rest, { id, ...expected }, `id historique ${id} modifié`);
  }
});

test('licences à conditions documentées', () => {
  const free = new Set(['Apache-2.0', 'MIT', 'BSD-3-Clause']);
  for (const m of models) {
    if (!free.has(m.license)) assert.ok(isStr(m.licenseNote), `[${m.id}] licence « ${m.license} » sans licenseNote`);
  }
});
