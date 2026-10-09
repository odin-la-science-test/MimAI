// Tests du conseiller de modeles par specialite (src/services/advisor.ts). Lancer : npm run test:advisor
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./_ts-loader.cjs');
const A = load('src/services/advisor.ts');

const GB = 1e9;
const mk = (id, over = {}) => ({ id, name: id, family: 'F-' + id, paramsB: 3, quant: 'Q4_K_M', tags: [], needRamGb: 2.5, sizeBytes: 2 * GB, ...over });
const P = (ramGb, freeDiskGb = 50) => ({ ramGb, freeDiskGb });

test('code : un modele code ou coder passe devant un generaliste de meme taille', () => {
  const m = [mk('general'), mk('codeur', { tags: ['code'] }), mk('Qwen Coder', { tags: ['code'] })];
  const r = A.rankForSpecialty(m, 'code', P(12), 3);
  assert.deepEqual(r.slice(0, 2).map(x => x.model.id).sort(), ['Qwen Coder', 'codeur']);
  assert.equal(r[0].model.id, 'Qwen Coder');
  assert.ok(r[0].why.some(w => /code/i.test(w)));
});

test('raisonnement : privilegie raisonnement et maths, penalise les tres petits', () => {
  const m = [
    mk('petit-think', { paramsB: 0.5, needRamGb: 1, sizeBytes: 0.4 * GB, tags: ['raisonnement'] }),
    mk('moyen-think', { name: 'X Thinking', tags: ['raisonnement', 'maths'] }),
    mk('banal'),
  ];
  assert.equal(A.rankForSpecialty(m, 'raisonnement', P(12), 3)[0].model.id, 'moyen-think');
});

test('francais et multilingue : les etiquettes decident', () => {
  const m = [mk('fr', { tags: ['francais'] }), mk('multi', { tags: ['multilingue'] }), mk('rien')];
  assert.equal(A.rankForSpecialty(m, 'francais', P(12), 3)[0].model.id, 'fr');
  assert.equal(A.rankForSpecialty(m, 'multilingue', P(12), 3)[0].model.id, 'multi');
});

test('rapide : le plus leger gagne', () => {
  const m = [
    mk('gros', { paramsB: 8, sizeBytes: 4.5 * GB, needRamGb: 5.9 }),
    mk('moyen'),
    mk('mini', { paramsB: 0.5, sizeBytes: 0.4 * GB, needRamGb: 1.2, tags: ['leger'] }),
  ];
  assert.equal(A.rankForSpecialty(m, 'rapide', P(16), 3)[0].model.id, 'mini');
});

test('adaptation a l appareil : jamais de modele trop lourd ; limite seulement pour le maximum', () => {
  const m = [
    mk('lourd', { paramsB: 14, sizeBytes: 8 * GB, needRamGb: 9.9 }),
    mk('ok'),
    mk('limite', { paramsB: 8, sizeBytes: 4.5 * GB, needRamGb: 5.2 }),
  ];
  const gen = A.rankForSpecialty(m, 'general', P(8), 5).map(x => x.model.id);
  assert.ok(!gen.includes('lourd'));
  assert.ok(!gen.includes('limite'));
  const max = A.rankForSpecialty(m, 'maximum', P(8), 5);
  assert.ok(max.some(x => x.model.id === 'limite'));
  assert.ok(!max.some(x => x.model.id === 'lourd'));
  assert.equal(max.find(x => x.model.id === 'limite').fit.level, 'limite');
});

test('disque insuffisant : exclu ; aucun candidat -> liste vide, jamais de remplissage', () => {
  const m = [mk('a'), mk('b')];
  assert.deepEqual(A.rankForSpecialty(m, 'general', P(12, 1), 5), []);
  assert.deepEqual(A.rankForSpecialty([], 'code', P(8), 5), []);
});

test('diversite des familles et n respecte', () => {
  const m = [mk('a1', { family: 'A', paramsB: 4 }), mk('a2', { family: 'A', paramsB: 4 }), mk('b1', { family: 'B', paramsB: 3.9 })];
  const r = A.rankForSpecialty(m, 'general', P(16), 2);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map(x => x.model.family).sort(), ['A', 'B']);
});

test('chaque specialite est complete et la note d honnetete cite la fenetre de 2 048 jetons', () => {
  assert.ok(A.SPECIALTIES.length >= 7);
  A.SPECIALTIES.forEach(s => assert.ok(s.id && s.label && s.hint));
  assert.match(A.ADVISOR_NOTE, /2 048/);
  assert.match(A.ADVISOR_NOTE, /pas d’après des tests mesurés/);
});

test('catalogue reel : chaque specialite donne des resultats sur 4, 8 et 12 Go', () => {
  const cat = require('../src/data/catalog.json').models;
  for (const ram of [4, 8, 12]) {
    for (const s of A.SPECIALTIES) {
      const r = A.rankForSpecialty(cat, s.id, P(ram, 30), 3);
      assert.ok(r.length >= 1, s.id + ' sur ' + ram + ' Go');
      r.forEach(x => assert.notEqual(x.fit.level, 'trop-lourd'));
    }
  }
  const code = A.rankForSpecialty(cat, 'code', P(4, 30), 2);
  assert.ok(code.some(x => /coder/i.test(x.model.name)), 'au moins un modele Coder sur 4 Go');
});
