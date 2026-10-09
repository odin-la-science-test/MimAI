// Tests de la logique pure d'apprentissage (src/services/training.ts).
// Exécution : npm run test:training   (Node >= 22.18 / 24, type-stripping natif, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/services/training.ts';

const now = Date.now();
const ex = (id, q, target, tags = ['court', 'tu'], base = '(réponse actuelle)') => ({ id, q, base, target, tags, ts: now, src: 'manual' });
const msg = (id, role, text, feedback = null) => ({ id, role, text, ts: now, feedback });
const conv = (id, flag, msgs) => ({ id, title: id, ts: now, trainFlag: flag, msgs });
const data = (over = {}) => ({
  convs: [], docs: [], memories: [], tex: [], runs: [], adapters: [], netLog: [], crashes: [],
  settings: { installed: ['qwen05b'], activeModel: 'qwen05b' }, ...over,
});
const adapter = (v, active, id = 'a' + v) => ({ id, v, name: 'x', createdAt: now, active, examples: 1, styleScore: 1, generalScore: 1, rules: [] });
const opts = { useExamples: true, useConvs: true, useDocs: false };

/* ───────── filtres TRAINING YES / NO / MEMORY_ONLY ───────── */
test('TRAINING flags: seul YES alimente le dataset', () => {
  const d = data({
    convs: [
      conv('c1', 'yes', [msg('u1', 'user', 'Bonjour comment vas-tu'), msg('a1', 'ai', 'Ça va bien, merci !')]),
      conv('c2', 'no', [msg('u2', 'user', 'Secret numéro deux'), msg('a2', 'ai', 'Réponse secrète')]),
      conv('c3', 'memory', [msg('u3', 'user', 'Je préfère le thé'), msg('a3', 'ai', 'Noté pour la mémoire')]),
    ],
  });
  const ds = T.datasetFrom(d, opts);
  assert.equal(ds.pairs.length, 1);
  assert.equal(ds.pairs[0].a, 'Ça va bien, merci !');
  assert.equal(ds.skipped.flagNo, 1);
  assert.equal(ds.skipped.flagMemory, 1);
  assert.ok(!JSON.stringify(ds.pairs).includes('secrète'));
  assert.ok(!JSON.stringify(ds.pairs).includes('thé'));
});

test('feedback: 👎 jamais cible positive ; 👎 puis 👍 = paire de préférence ; 👍 pèse 2', () => {
  const d = data({
    convs: [conv('c1', 'yes', [
      msg('u1', 'user', 'Écris un message pour décaler la réunion'), msg('a1', 'ai', 'Veuillez agréer mes salutations distinguées.', 'bad'),
      msg('u2', 'user', 'Plus court stp'), msg('a2', 'ai', 'Salut, on décale la réunion à demain ?', 'good'),
      msg('u3', 'user', 'Merci beaucoup'), msg('a3', 'ai', 'Avec plaisir'),
    ])],
  });
  const ds = T.datasetFrom(d, opts);
  assert.ok(!ds.pairs.some(p => p.a.includes('agréer') && !p.rejected), 'le 👎 ne doit pas être une cible');
  const pref = ds.pairs.find(p => p.rejected);
  assert.ok(pref && pref.rejected.includes('agréer') && pref.a.includes('décale'));
  assert.equal(ds.pairs.find(p => p.id === 'a3').weight, 1);
  assert.equal(ds.pairs.find(p => p.id === 'a2').weight, 2);
  const noUnrated = T.datasetFrom(d, { ...opts, includeUnrated: false });
  assert.ok(!noUnrated.pairs.some(p => p.id === 'a3'));
});

test('dataset: doublons, textes vides/trop longs écartés, useExamples=false', () => {
  const d = data({ tex: [ex('1', 'Salut', 'Hello toi'), ex('2', 'salut', 'hello toi'), ex('3', '', 'x'), ex('4', 'Q long', 'a'.repeat(5000))] });
  const ds = T.datasetFrom(d, opts);
  assert.equal(ds.pairs.length, 1);
  assert.equal(ds.skipped.duplicate, 1);
  assert.equal(ds.skipped.invalid, 2);
  assert.equal(T.datasetFrom(d, { ...opts, useExamples: false }).pairs.length, 0);
});

test('réponse initiale différente → paire de préférence (rejected)', () => {
  const ds = T.datasetFrom(data({ tex: [ex('1', 'Annule le déjeuner', 'Salut, je dois annuler le déj !', ['court'], 'Je me permets de vous informer...')] }), opts);
  assert.equal(ds.pairs[0].rejected, 'Je me permets de vous informer...');
});

/* ───────── split / export JSONL ───────── */
const many = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, q: 'question numéro ' + i + ' sujet' + (i % 5), a: 'réponse ' + i, src: 'example', weight: 2, tags: [], ts: now }));

test('splitPairs: déterministe, disjoint, jamais de holdout sur petit jeu', () => {
  const p = many(30);
  const a = T.splitPairs(p), b = T.splitPairs([...p].reverse());
  assert.deepEqual(a.holdout.map(x => x.id).sort(), b.holdout.map(x => x.id).sort());
  assert.equal(a.train.length + a.holdout.length, 30);
  assert.ok(a.holdout.every(h => !a.train.some(t => t.id === h.id)));
  assert.ok(a.holdout.length >= 2);
  assert.equal(T.splitPairs(many(4)).holdout.length, 0);
});

test('toJsonl: formats chat / alpaca / preference, lignes JSON valides', () => {
  const p = [{ id: '1', q: 'Q1', a: 'A1', src: 'example', weight: 2, tags: [], ts: now, rejected: 'R1' }, { id: '2', q: 'Q2\nligne', a: 'A "2"', src: 'conv', weight: 1, tags: [], ts: now }];
  const chat = T.toJsonl(p, 'chat').trim().split('\n').map(JSON.parse);
  assert.equal(chat.length, 2);
  assert.deepEqual(chat[0].messages.map(m => m.role), ['system', 'user', 'assistant']);
  assert.equal(chat[1].messages[2].content, 'A "2"');
  const alp = T.toJsonl(p, 'alpaca').trim().split('\n').map(JSON.parse);
  assert.equal(alp[1].instruction, 'Q2\nligne');
  const pref = T.toJsonl(p, 'preference').trim().split('\n').map(JSON.parse);
  assert.equal(pref.length, 1);
  assert.deepEqual(pref[0], { prompt: 'Q1', chosen: 'A1', rejected: 'R1' });
  assert.equal(T.toJsonl([], 'chat'), '');
});

/* ───────── few-shot par pertinence ───────── */
test('selectFewShots: pertinence, seuil, dédoublonnage, préférence au 👍', () => {
  const pairs = [
    { id: 'a', q: 'Rédige un message pour décaler la réunion de jeudi', a: 'Salut, on décale à vendredi ?', src: 'example', weight: 2, tags: [], ts: now },
    { id: 'b', q: 'Écris un message pour remercier Léa', a: 'Merci Léa !', src: 'example', weight: 2, tags: [], ts: now },
    { id: 'c', q: 'Recette de la tarte aux pommes', a: 'Pommes, pâte, sucre.', src: 'example', weight: 1, tags: [], ts: now },
    { id: 'd', q: 'rédige un message pour décaler la réunion de jeudi', a: 'doublon', src: 'conv', weight: 1, tags: [], ts: now },
  ];
  const r = T.selectFewShots('Peux-tu rédiger un message pour décaler la réunion de lundi', pairs, 3);
  assert.equal(r[0].id, 'a');
  assert.ok(r.length <= 2 && !r.some(x => x.id === 'c'), 'tarte non pertinente');
  assert.equal(r.filter(x => T.contentTokens(x.q).join() === T.contentTokens(pairs[0].q).join()).length, 1, 'dédoublonné');
  assert.deepEqual(T.selectFewShots('astronomie quantique', pairs), []);
  assert.deepEqual(T.selectFewShots('', pairs), []);
});

test('rulesFrom: règles déduites des tags', () => {
  const r = T.rulesFrom([{ tags: ['court', 'tu'] }, { tags: ['court', 'tu', 'direct'] }], 'style');
  assert.ok(r.some(x => /courtes/.test(x)) && r.some(x => /Tutoyer/.test(x)));
});

/* ───────── versionnage, activation, rollback ───────── */
test('versionnage v001 → vN', () => {
  assert.equal(T.fmtVersion(1), 'v001');
  assert.equal(T.fmtVersion(42), 'v042');
  assert.equal(T.nextVersion([]), 1);
  assert.equal(T.nextVersion([adapter(1, false), adapter(3, true)]), 4);
  assert.equal(T.adapterRelPath(7), 'adapters/v007/adapter.gguf');
});

test('activateExclusive: un seul actif', () => {
  const ads = [adapter(1, true), adapter(2, true), adapter(3, false)];
  T.activateExclusive(ads, 'a3');
  assert.deepEqual(ads.map(a => a.active), [false, false, true]);
  T.activateExclusive(ads, null);
  assert.ok(ads.every(a => !a.active));
});

test('rollback: revient à la version précédente, conserve tout, base seule si aucune', () => {
  const d = data({ adapters: [adapter(1, false), adapter(2, false), adapter(3, true)] });
  const prev = T.rollbackToPrevious(d);
  assert.equal(prev.v, 2);
  assert.equal(d.adapters.length, 3, 'rien de supprimé');
  assert.deepEqual(d.adapters.map(a => a.active), [false, true, false]);
  T.rollbackToPrevious(d); T.rollbackToPrevious(d);
  assert.ok(d.adapters.every(a => !a.active), 'retour au modèle de base');
  assert.equal(T.planRollback([adapter(1, false), adapter(2, false)]).to, 'a2');
  assert.equal(T.planRollback([]).to, null);
});

test('applyOutcome: nouvelle version, ancienne conservée mais inactive', () => {
  const d = data({ adapters: [adapter(1, true)] });
  const out = { run: { id: 'r', status: 'pass' }, adapter: { ...adapter(0, true, 'new'), v: 0 }, rejected: false, report: {} };
  const a = T.applyOutcome(d, out);
  assert.equal(a.v, 2);
  assert.deepEqual(d.adapters.map(x => [x.v, x.active]), [[1, false], [2, true]]);
  const rej = T.applyOutcome(d, { run: { id: 'r2', status: 'fail' }, adapter: null, rejected: true, report: {} });
  assert.equal(rej, null);
  assert.equal(d.adapters.length, 2);
  assert.equal(d.runs.length, 2);
});

test('méta d\'adaptateur: pack/parse, filtrée à l\'affichage', () => {
  const m = { kind: 'lora', evalMode: 'generative', style: 12, general: 90, baseStyle: 5, baseGeneral: 92, holdout: 8, verdict: 'pass', reasons: ['ok'], file: 'adapters/v001/adapter.gguf', scale: 1 };
  const rules = T.packMeta(['Tutoyer'], m);
  assert.deepEqual(T.parseMeta(rules), m);
  assert.deepEqual(T.visibleRules(rules), ['Tutoyer']);
  assert.equal(T.parseMeta(['x']), null);
  assert.equal(T.parseMeta(['@mimai:{oops']), null);
  assert.equal(T.packMeta(rules, m).filter(r => r.startsWith('@mimai:')).length, 1);
});

/* ───────── décision PASS / FAIL ───────── */
const S = (style, general, holdoutN = 8, degenerate = 0) => ({ style, general, holdoutN, generalN: 12, degenerate });

test('decide: PASS quand le style progresse sans oubli', () => {
  const d = T.decide(S(20, 91.7), S(31, 91.7));
  assert.equal(d.verdict, 'pass'); assert.equal(d.styleGain, 11);
});
test('decide: FAIL sur oubli catastrophique (capacités générales)', () => {
  const d = T.decide(S(20, 91.7), S(55, 58.3));
  assert.equal(d.verdict, 'fail');
  assert.ok(d.reasons.some(r => /Oubli/.test(r)));
  assert.ok(d.reasons.some(r => /plancher/.test(r)));
});
test('decide: FAIL sans gain de style', () => {
  assert.equal(T.decide(S(20, 90), S(20.5, 90)).verdict, 'fail');
  assert.equal(T.decide(S(20, 90), S(18, 90)).verdict, 'fail');
});
test('decide: FAIL sur dégénérescence ; inconclusive si jeu de test trop petit', () => {
  assert.equal(T.decide(S(20, 90), S(40, 90, 8, 3)).verdict, 'fail');
  assert.equal(T.decide(S(20, 90), S(40, 90, 3)).verdict, 'inconclusive');
});
test('decide: seuils limites (drop = max autorisé passe, +1 échoue)', () => {
  assert.equal(T.decide(S(20, 90), S(30, 80)).verdict, 'pass');
  assert.equal(T.decide(S(20, 90), S(30, 79.9)).verdict, 'fail');
});

/* ───────── benchmark de capacités générales (forgetting) avec évaluateur simulé ───────── */
const holdout = many(10).map((p, i) => ({ ...p, a: 'salut ça marche ' + i }));
const answerGeneral = (prompt) => T.GENERAL_CHECKS.find(g => g.prompt === prompt);
const goodAnswers = { 'Quelle est la capitale de la France ?': 'Paris', 'Combien font 17 + 25 ?': '42', 'Combien font 9 fois 8 ?': '72', 'Quel est le contraire de « chaud » ?': 'froid', 'Combien de jours y a-t-il dans une semaine ?': '7', 'De quelle couleur est le ciel par temps clair ?': 'bleu', 'Comment dit-on « merci » en anglais ?': 'thank you', 'Combien font 100 divisé par 4 ?': '25', 'Quelle planète est la plus proche du Soleil ?': 'Mercure', 'Combien y a-t-il de mois dans une année ?': '12', 'Quelle est la capitale de l’Italie ?': 'Rome', 'Combien de côtés a un triangle ?': '3' };

function fakeEvaluator({ candStyle = true, forget = 0 }) {
  return {
    async generate(messages, variant) {
      const q = messages[messages.length - 1].content;
      const g = answerGeneral(q);
      if (g) {
        const idx = T.GENERAL_CHECKS.indexOf(g);
        if (variant === 'cand' && idx < forget) return 'blablabla blablabla blablabla blablabla blablabla';
        return goodAnswers[q];
      }
      const h = holdout.find(x => x.q === q);
      return variant === 'cand' && candStyle ? h.a : 'Bonjour, je me permets de vous informer de ce qui suit.';
    },
  };
}
const bench = (ev) => T.runBenchmark(ev, { holdout, messagesFor: (q) => [{ role: 'user', content: q }] });

test('benchmark: adaptateur sain → PASS', async () => {
  const r = await bench(fakeEvaluator({}));
  assert.equal(r.base.general, 100); assert.equal(r.cand.general, 100);
  assert.ok(r.cand.style > r.base.style + 50);
  assert.equal(T.decide(r.base, r.cand).verdict, 'pass');
  assert.ok(r.samples.length >= 1);
});
test('benchmark: catastrophic forgetting détecté → FAIL', async () => {
  const r = await bench(fakeEvaluator({ forget: 6 }));
  assert.equal(r.cand.general, 50);
  const d = T.decide(r.base, r.cand);
  assert.equal(d.verdict, 'fail');
  assert.ok(d.generalDrop >= 50);
});
test('benchmark: aucun gain de style → FAIL', async () => {
  const r = await bench(fakeEvaluator({ candStyle: false }));
  assert.equal(T.decide(r.base, r.cand).verdict, 'fail');
});
test('benchmark: progression réelle (onProgress monotone jusqu\'au total)', async () => {
  const seen = [];
  await T.runBenchmark(fakeEvaluator({}), { holdout, messagesFor: (q) => [{ role: 'user', content: q }], onProgress: (d, t) => seen.push([d, t]) });
  assert.equal(seen.length, (10 + 12) * 2);
  assert.deepEqual(seen.at(-1), [44, 44]);
});

test('tokenF1 / isDegenerate', () => {
  assert.equal(T.tokenF1('salut ça va', 'salut ça va'), 1);
  assert.equal(T.tokenF1('abc', 'xyz'), 0);
  assert.ok(T.isDegenerate('') && T.isDegenerate('la '.repeat(30)) && !T.isDegenerate('Paris est la capitale.'));
});

/* ───────── pipeline profil complet (trainAndEvaluate) ───────── */
const richData = () => data({ tex: many(20).map((p, i) => ex('e' + i, 'Rédige un message numéro ' + i + ' pour décaler la réunion ' + (i % 4), 'Salut, on décale la réunion ' + i + ' ok ?')) });

test('trainAndEvaluate sans modèle: honnête (retrieval, pas de score général inventé)', async () => {
  T.registerEvaluatorFactory(null);
  const ticks = [];
  const out = await T.trainAndEvaluate(richData(), 'style', opts, (p, ph) => ticks.push([p, ph]));
  assert.equal(out.report.evalMode, 'retrieval');
  assert.equal(out.report.verdict, 'inconclusive');
  assert.equal(out.run.generalScore, undefined, 'aucun score de capacités inventé');
  const meta = T.parseMeta(out.adapter.rules);
  assert.equal(meta.kind, 'profile'); assert.equal(meta.general, null); assert.equal(meta.evalMode, 'retrieval');
  assert.ok(ticks.every(([p], i) => i === 0 || p >= ticks[i - 1][0]), 'progression monotone');
  assert.equal(ticks.at(-1)[0], 100);
  assert.equal(T.reportFor(out.run.id).dataset.holdout > 0, true);
});

test('trainAndEvaluate trop peu de données → refusé, pas d\'adaptateur', async () => {
  const out = await T.trainAndEvaluate(data({ tex: [ex('1', 'a b', 'c d')] }), 'style', opts, () => {});
  assert.equal(out.rejected, true); assert.equal(out.adapter, null); assert.equal(out.run.status, 'fail');
  assert.equal(out.report.verdict, 'insufficient');
});

test('trainAndEvaluate avec évaluateur: PASS puis FAIL si oubli', async () => {
  const d = richData();
  const mk = (forget, gain) => ({
    async generate(messages, variant) {
      const q = messages[messages.length - 1].content;
      const g = answerGeneral(q);
      if (g) return variant === 'cand' && T.GENERAL_CHECKS.indexOf(g) < forget ? 'zzz zzz zzz zzz zzz zzz zzz zzz zzz zzz zzz zzz zzz' : goodAnswers[q];
      return variant === 'cand' && gain ? 'Salut, on décale la réunion ok ?' : 'Bonjour, veuillez noter ceci.';
    },
  });
  T.registerEvaluatorFactory(async () => mk(0, true));
  const ok = await T.trainAndEvaluate(d, 'style', opts, () => {});
  assert.equal(ok.report.evalMode, "generative"); assert.equal(ok.run.status, "pass", JSON.stringify(ok.report.reasons));
  assert.ok(ok.adapter && T.parseMeta(ok.adapter.rules).baseStyle !== null);
  T.registerEvaluatorFactory(async () => mk(8, true));
  const bad = await T.trainAndEvaluate(d, 'style', opts, () => {});
  assert.equal(bad.run.status, 'fail'); assert.equal(bad.adapter, null);
  assert.ok(bad.report.reasons.some(r => /Oubli/.test(r)));
  T.registerEvaluatorFactory(async () => { throw new Error('boom'); });
  const err = await T.trainAndEvaluate(d, 'style', opts, () => {});
  assert.equal(err.report.evalMode, 'retrieval', 'évaluateur en erreur → repli honnête');
  T.registerEvaluatorFactory(null);
});

/* ───────── GGUF / compatibilité LoRA ───────── */
function buildGguf({ kv = {}, tensors = [] }) {
  const parts = [];
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); parts.push(b); };
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); parts.push(b); };
  const str = (s) => { const e = Buffer.from(s); u64(e.length); parts.push(e); };
  parts.push(Buffer.from('GGUF')); u32(3); u64(tensors.length); u64(Object.keys(kv).length);
  for (const [k, v] of Object.entries(kv)) {
    str(k);
    if (typeof v === 'string') { u32(8); str(v); }
    else if (typeof v === 'number') { u32(6); const b = Buffer.alloc(4); b.writeFloatLE(v); parts.push(b); }
    else if (Array.isArray(v)) { u32(9); u32(8); u64(v.length); v.forEach(str); }
  }
  for (const t of tensors) { str(t.name); u32(t.dims.length); t.dims.forEach(u64); u32(t.type ?? 1); u64(0); }
  return new Uint8Array(Buffer.concat(parts));
}
const loraTensors = (nEmbd, layers, r = 8) => Array.from({ length: layers }, (_, i) => [
  { name: `blk.${i}.attn_q.weight.lora_a`, dims: [nEmbd, r] }, { name: `blk.${i}.attn_q.weight.lora_b`, dims: [r, nEmbd] },
]).flat();
const goodKv = { 'general.type': 'adapter', 'adapter.type': 'lora', 'general.architecture': 'qwen2', 'adapter.lora.alpha': 16, 'general.name': 'Qwen2.5 0.5B Instruct LoRA', 'tokenizer.junk': ['a', 'bb'] };

test('GGUF: en-tête valide parsé (kv, tenseurs, tableau ignoré)', () => {
  const g = T.parseGguf(buildGguf({ kv: goodKv, tensors: loraTensors(896, 24) }));
  assert.equal(g.ok, true); assert.equal(g.version, 3);
  assert.equal(g.kv['general.architecture'], 'qwen2'); assert.equal(g.kv['adapter.lora.alpha'], 16);
  assert.equal(g.tensors.length, 48);
});
test('GGUF: signature invalide / tronqué', () => {
  assert.equal(T.parseGguf(new Uint8Array(100)).ok, false);
  assert.match(T.parseGguf(new Uint8Array(100)).error, /GGUF/);
  const full = buildGguf({ kv: goodKv, tensors: loraTensors(896, 24) });
  const cut = T.parseGguf(full.subarray(0, full.length - 40));
  assert.equal(cut.truncated, true); assert.equal(cut.ok, true, 'kv complets, tenseurs partiels');
  assert.equal(T.parseGguf(full.subarray(0, 60)).ok, false);
});
test('compat LoRA: bon adaptateur Qwen 0.5B accepté', () => {
  const g = T.parseGguf(buildGguf({ kv: goodKv, tensors: loraTensors(896, 24) }));
  const c = T.checkLoraCompat(g, 'qwen05b', 4_000_000, 'adapter.gguf');
  assert.deepEqual(c.errors, []); assert.equal(c.ok, true); assert.equal(c.rank, 8); assert.equal(c.nLayer, 24);
});
test('compat LoRA: refus modèle complet, mauvaise archi, mauvaise taille de modèle, fichier minuscule', () => {
  const full = T.parseGguf(buildGguf({ kv: { 'general.architecture': 'qwen2' }, tensors: [] }));
  assert.match(T.checkLoraCompat(full, 'qwen05b', 4_000_000, 'm.gguf').errors.join(), /pas un adaptateur/);
  const llama = T.parseGguf(buildGguf({ kv: { ...goodKv, 'general.architecture': 'llama' }, tensors: loraTensors(896, 24) }));
  assert.match(T.checkLoraCompat(llama, 'qwen05b', 4_000_000).errors.join(), /Architecture/);
  const big = T.parseGguf(buildGguf({ kv: goodKv, tensors: loraTensors(1536, 28) }));
  assert.match(T.checkLoraCompat(big, 'qwen05b', 4_000_000).errors.join(), /Dimension incompatible/);
  assert.equal(T.checkLoraCompat(big, 'qwen15b', 4_000_000).ok, true);
  const ok = T.parseGguf(buildGguf({ kv: goodKv, tensors: loraTensors(896, 24) }));
  assert.match(T.checkLoraCompat(ok, 'qwen05b', 100).errors.join(), /trop petit/);
  assert.match(T.checkLoraCompat(ok, 'qwen05b', 2 ** 30).errors.join(), /volumineux/);
  assert.match(T.checkLoraCompat(ok, 'inconnu', 4_000_000).errors.join(), /inconnu/);
  assert.match(T.checkLoraCompat(ok, 'qwen05b', 4_000_000, 'x.bin').errors.join(), /\.gguf/);
});

/* ───────── import LoRA: décision d'enregistrement ───────── */
const inp = { modelId: 'qwen05b', name: 'Mon LoRA', file: 'adapters/v001/adapter.gguf', sha256: 'ab'.repeat(32), sizeBytes: 4e6, scale: 1, check: { ok: true, errors: [], warnings: [], arch: 'qwen2', rank: 8, alpha: 16 }, examples: 50 };

test('LoRA: PASS → adaptateur actif avec méta (sha256, fichier, échelle) ; FAIL → aucun ; sans bench → FAIL', async () => {
  const good = await bench(fakeEvaluator({}));
  const o = T.buildLoraOutcome(inp, good);
  assert.equal(o.run.status, 'pass'); const m = T.parseMeta(o.adapter.rules);
  assert.equal(m.kind, 'lora'); assert.equal(m.sha256, inp.sha256); assert.equal(m.scale, 1); assert.equal(m.file, inp.file);
  const bad = T.buildLoraOutcome(inp, await bench(fakeEvaluator({ forget: 8 })));
  assert.equal(bad.adapter, null); assert.equal(bad.run.status, 'fail');
  const none = T.buildLoraOutcome(inp, null, 'llama.rn absent');
  assert.equal(none.adapter, null); assert.match(none.report.reasons[0], /llama\.rn absent/);
  const small = T.buildLoraOutcome(inp, { ...good, base: { ...good.base, holdoutN: 3 }, cand: { ...good.cand, holdoutN: 3 } });
  assert.equal(small.adapter, null, 'un LoRA ne s\'active jamais sur résultat non concluant');
});

test('LoRA: v001 → v002, rollback restaure v001', async () => {
  const d = data();
  const good = await bench(fakeEvaluator({}));
  const a1 = T.applyOutcome(d, T.buildLoraOutcome(inp, good));
  const a2 = T.applyOutcome(d, T.buildLoraOutcome({ ...inp, file: 'adapters/v002/adapter.gguf' }, good));
  assert.deepEqual([a1.v, a2.v], [1, 2]);
  assert.equal(T.activeAdapter(d).v, 2);
  T.rollbackToPrevious(d);
  assert.equal(T.activeAdapter(d).v, 1);
  assert.equal(T.parseMeta(d.adapters[0].rules).file, 'adapters/v001/adapter.gguf', 'fichier de v001 intact');
});

/* ───────── capacités appareil ───────── */
test('capacités: entraînement sur appareil indisponible par défaut (honnête)', () => {
  const c = T.detectCapabilities({ llama: true, modelInstalled: true, ramBytes: 12 * 1024 ** 3, batteryLevel: 1, charging: true });
  assert.equal(T.ON_DEVICE_FINETUNE_AVAILABLE, false);
  assert.equal(c.onDeviceFinetune, false); assert.match(c.onDeviceReason, /llama_opt/);
  assert.equal(c.loraImport, true);
  const go = T.detectCapabilities({ llama: false, modelInstalled: false, ramBytes: null, batteryLevel: null, charging: null });
  assert.equal(go.loraImport, false); assert.match(go.loraReason, /Expo Go/);
});
test('capacités: garde-fous matériels si un jour le moteur l\'expose', () => {
  const env = { llama: true, modelInstalled: true, ramBytes: 8 * 1024 ** 3, batteryLevel: 0.9, charging: true, thermalOk: true };
  assert.equal(T.detectCapabilities(env, true).onDeviceFinetune, true);
  assert.equal(T.detectCapabilities({ ...env, ramBytes: 4 * 1024 ** 3 }, true).onDeviceFinetune, false);
  assert.equal(T.detectCapabilities({ ...env, charging: false, batteryLevel: 0.3 }, true).onDeviceFinetune, false);
  assert.equal(T.detectCapabilities({ ...env, thermalOk: false }, true).onDeviceFinetune, false);
  assert.equal(T.detectCapabilities({ ...env, llama: false }, true).onDeviceFinetune, false);
});
