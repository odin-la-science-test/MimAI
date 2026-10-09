// Tests de la logique pure de compatibilité / recommandation (src/services/fit.ts).
// Exécution : npm run test:fit   (Node >= 22.18 / 24, type-stripping natif, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as F from '../src/services/fit.ts';

const GB = 1e9;
const mk = (id, over = {}) => ({ id, name: id, family: 'Fam', paramsB: 1, quant: 'Q4_K_M', tags: [], needRamGb: 1, sizeBytes: 0.8 * GB, ...over });
const P = (ramGb, freeDiskGb = 50) => ({ ramGb, freeDiskGb });

test('seuils RAM : 0,35 / 0,5 / 0,65 (inclus)', () => {
  assert.equal(F.fitFor(mk('a', { needRamGb: 3.5 }), P(10)).level, 'ideal');
  assert.equal(F.fitFor(mk('a', { needRamGb: 3.6 }), P(10)).level, 'ok');
  assert.equal(F.fitFor(mk('a', { needRamGb: 5 }), P(10)).level, 'ok');
  assert.equal(F.fitFor(mk('a', { needRamGb: 5.1 }), P(10)).level, 'limite');
  assert.equal(F.fitFor(mk('a', { needRamGb: 6.5 }), P(10)).level, 'limite');
  const t = F.fitFor(mk('a', { needRamGb: 6.6 }), P(10));
  assert.equal(t.level, 'trop-lourd');
  assert.equal(t.blockedBy, 'ram');
});

test('RAM inconnue : ok seulement pour <= 1,5 Go, sinon limite', () => {
  assert.equal(F.fitFor(mk('a', { needRamGb: 1.5 }), P(null)).level, 'ok');
  assert.equal(F.fitFor(mk('a', { needRamGb: 1.6 }), P(null)).level, 'limite');
  assert.equal(F.fitFor(mk('a', { needRamGb: 6 }), P(null)).level, 'limite');
  assert.equal(F.fitFor(mk('a', { needRamGb: 1 }), P(0)).level, 'ok');
});

test('disque : refus si libre < 1,1 x taille, indépendamment de la RAM', () => {
  const m = mk('a', { needRamGb: 0.5, sizeBytes: 2 * GB });
  const no = F.fitFor(m, P(16, 2.19));
  assert.equal(no.level, 'trop-lourd'); assert.equal(no.blockedBy, 'disk');
  assert.equal(F.fitFor(m, P(16, 2.2)).level, 'ideal');
  assert.equal(F.fitFor(m, P(16, null)).level, 'ideal'); /* disque inconnu : pas de refus */
  assert.equal(F.fitFor(m, P(null, 1)).blockedBy, 'disk');
});

test('vitesse : estimation qualitative, jamais de tokens/s', () => {
  assert.equal(F.speedFor(0.5 * GB), 'rapide');
  assert.equal(F.speedFor(1.5 * GB), 'moyen');
  assert.equal(F.speedFor(4 * GB), 'lent');
  const f = F.fitFor(mk('a'), P(8));
  assert.match(f.speedLabel, /estimation/);
  assert.doesNotMatch(JSON.stringify(f), /token|tok\/s|t\/s/i);
});

test('score : quant très basse pénalisée, français favorisé', () => {
  assert.ok(F.qualityScore(mk('a', { quant: 'Q2_K' })) < F.qualityScore(mk('a', { quant: 'Q4_K_M' })));
  assert.ok(F.qualityScore(mk('a', { quant: 'IQ3_XS' })) < F.qualityScore(mk('a', { quant: 'Q4_K_M' })));
  assert.ok(F.qualityScore(mk('a', { tags: ['francais'] })) > F.qualityScore(mk('a')));
  assert.ok(F.qualityScore(mk('a', { paramsB: 3 })) > F.qualityScore(mk('a', { paramsB: 1 })));
  assert.ok(F.qualityScore(mk('a', { rank: 1 })) > F.qualityScore(mk('a', { rank: 80 })));
});

test('recommend : uniquement ideal/ok, trié par qualité, sans remplissage', () => {
  const ms = [
    mk('petit', { paramsB: 0.5, needRamGb: 1, family: 'A' }),
    mk('moyen', { paramsB: 3, needRamGb: 3, family: 'B' }),
    mk('gros', { paramsB: 8, needRamGb: 7, family: 'C' }), /* 7/8 = trop lourd */
    mk('disque', { paramsB: 4, needRamGb: 1, family: 'D', sizeBytes: 60 * GB }),
  ];
  const r = F.recommend(ms, P(8, 30), 5).map(m => m.id);
  assert.deepEqual(r, ['moyen', 'petit']);
  assert.deepEqual(F.recommend(ms, P(1, 30), 3), []);
  assert.deepEqual(F.recommend([], P(8), 3), []);
});

test('recommend : diversifie les familles', () => {
  const ms = [
    mk('q3', { family: 'Qwen', paramsB: 3, needRamGb: 2.5 }), mk('q2', { family: 'Qwen', paramsB: 2.9, needRamGb: 2.4 }), mk('q1', { family: 'Qwen', paramsB: 2.8, needRamGb: 2.3 }),
    mk('g2', { family: 'Gemma', paramsB: 2, needRamGb: 2 }), mk('l1', { family: 'Llama', paramsB: 1.5, needRamGb: 1.5 }),
  ];
  const r = F.recommend(ms, P(10, 50), 3).map(m => m.id);
  /* sans pénalité de famille : q3, q2, q1 ; avec : une autre famille s'intercale */
  assert.ok(new Set(r.map(id => ms.find(m => m.id === id).family)).size >= 2);
  assert.ok(r.includes('g2'));
  assert.equal(r[0], 'q3');
  assert.equal(F.recommend(ms, P(10, 50), 5).length, 5);
});

test('filtres : tailles et recherche', () => {
  assert.equal(F.sizeBucket(0.99 * GB), 'leger');
  assert.equal(F.sizeBucket(1 * GB), 'moyen');
  assert.equal(F.sizeBucket(2.5 * GB), 'moyen');
  assert.equal(F.sizeBucket(2.6 * GB), 'lourd');
  assert.ok(F.matchesQuery({ name: 'Qwen 2.5 Instruct', family: 'Qwen' }, 'qwen inst'));
  assert.ok(F.matchesQuery({ name: 'Mistral Été', family: 'Mistral' }, 'ete'));
  assert.ok(!F.matchesQuery({ name: 'Qwen', family: 'Qwen' }, 'llama'));
  assert.ok(F.matchesQuery({ name: 'x', family: 'y' }, '  '));
});

/* catalogue réel (graine ou final) + faux catalogue de 100 modèles généré en mémoire */
test('catalogue réel : recommandations cohérentes quelle que soit sa taille', () => {
  const cat = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(cat.models) && cat.models.length >= 1);
  for (const profile of [P(null, null), P(3, 5), P(6, 20), P(12, 100)]) {
    const r = F.recommend(cat.models, profile, 5);
    assert.ok(r.length <= 5);
    for (const m of r) assert.ok(['ideal', 'ok'].includes(F.fitFor(m, profile).level));
  }
});

test('faux catalogue de 100 modèles : bornes, familles, performance', () => {
  const fams = ['Qwen', 'Llama', 'Gemma', 'Phi', 'Mistral', 'SmolLM', 'Granite', 'DeepSeek'];
  const ms = Array.from({ length: 100 }, (_, i) => {
    const paramsB = [0.5, 0.8, 1.2, 1.7, 2, 3, 4, 7, 8, 14][i % 10];
    return mk('m' + i, { family: fams[i % fams.length], paramsB, needRamGb: 0.6 + paramsB * 0.75, sizeBytes: paramsB * 0.6 * GB, rank: i + 1, tags: i % 3 === 0 ? ['francais'] : [], quant: i % 7 === 0 ? 'Q2_K' : 'Q4_K_M' });
  });
  for (const ram of [null, 2, 3, 4, 6, 8, 12, 16]) {
    const r = F.recommend(ms, P(ram, 40), 5);
    assert.ok(r.length <= 5);
    assert.equal(new Set(r.map(m => m.id)).size, r.length);
    for (const m of r) assert.ok(['ideal', 'ok'].includes(F.fitFor(m, P(ram, 40)).level));
    if (ram === 16) assert.ok(new Set(r.map(m => m.family)).size >= 4, 'diversité des familles à 16 Go');
    if (ram === 2) for (const m of r) assert.ok(m.needRamGb <= 1);
  }
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) F.recommend(ms, P(8, 40), 5);
  assert.ok(performance.now() - t0 < 1000);
});

test('quantSpeedNote : alerte seulement pour les formats IQ (pas de noyau ARM optimise)', () => {
  assert.match(F.quantSpeedNote('IQ4_XS'), /plus lent/);
  assert.match(F.quantSpeedNote('iq3_m'), /IQ3_M/);
  assert.equal(F.quantSpeedNote('Q4_K_M'), null);
  assert.equal(F.quantSpeedNote('Q8_0'), null);
});
