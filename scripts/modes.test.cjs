// Tests de l'association modèle <-> fonction (src/services/modes.ts). Lancer : npm run test:modes
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./_ts-loader.cjs')('src/services/modes.ts');

const defs = { petit: { tags: ['leger'] }, grand: { tags: ['raisonnement'] }, oeil: { tags: ['vision'] } };

test('modèle d\'une fonction : le choix s\'il est installé, sinon le modèle actif', () => {
  const inst = ['petit', 'grand'];
  assert.equal(M.modelForMode(inst, 'petit', { reflexion: 'grand' }, 'reflexion'), 'grand');
  assert.equal(M.modelForMode(inst, 'petit', { reflexion: 'grand' }, 'rapide'), 'petit');
  assert.equal(M.modelForMode(inst, 'petit', { reflexion: 'disparu' }, 'reflexion'), 'petit', 'modèle supprimé : repli sur le modèle actif');
  assert.equal(M.modelForMode(inst, 'petit', undefined, 'outils'), 'petit');
});

test('candidats : tous les modèles installés ; la vision seulement ceux qui voient les images', () => {
  const inst = ['petit', 'grand', 'oeil', 'inconnu'];
  assert.deepEqual(M.candidatesFor('rapide', inst, defs), ['petit', 'grand', 'oeil']);
  assert.deepEqual(M.candidatesFor('vision', inst, defs), ['oeil']);
  assert.deepEqual(M.candidatesFor('vision', ['petit'], defs), [], 'aucun modèle de vision : liste vide, rien d\'inventé');
});

test('affectation : ajout, retour à automatique, nettoyage des choix périmés', () => {
  let t = M.assign(undefined, 'rapide', 'petit', ['petit', 'grand']);
  assert.deepEqual(t, { rapide: 'petit' });
  t = M.assign(t, 'reflexion', 'grand', ['petit', 'grand']);
  assert.deepEqual(t, { rapide: 'petit', reflexion: 'grand' });
  t = M.assign(t, 'rapide', null, ['petit', 'grand']);
  assert.deepEqual(t, { reflexion: 'grand' });
  t = M.assign(t, 'outils', 'petit', ['petit']);          // 'grand' n'est plus installé : son choix disparaît
  assert.deepEqual(t, { outils: 'petit' });
  assert.deepEqual(M.assign({ rapide: 'x' }, 'rapide', 'inconnu', ['petit']), {}, 'on n\'affecte jamais un modèle non installé');
});

test('modèle suivant : boucle sur la liste', () => {
  assert.equal(M.nextModel(['a', 'b', 'c'], 'a'), 'b');
  assert.equal(M.nextModel(['a', 'b', 'c'], 'c'), 'a');
  assert.equal(M.nextModel(['a', 'b'], 'zzz'), 'a');
  assert.equal(M.nextModel([], 'a'), null);
});

test('catalogue de vision : chaque modèle a son module image (mmproj) vérifiable, étiqueté « vision »', () => {
  const v = require('../src/data/vision.json').models;
  assert.ok(v.length >= 3);
  const ids = new Set();
  for (const m of v) {
    assert.ok(M.isVisionModel(m), m.id + ' doit porter l etiquette vision');
    assert.match(m.sha256, /^[0-9a-f]{64}$/);
    assert.match(m.mmproj.sha256, /^[0-9a-f]{64}$/);
    assert.ok(m.mmproj.sizeBytes > 1e7 && m.sizeBytes > 1e8);
    assert.ok(m.url.startsWith('https://huggingface.co/') && m.mmproj.url.startsWith('https://huggingface.co/'));
    assert.notEqual(m.file, m.mmproj.file);
    assert.ok(!ids.has(m.id)); ids.add(m.id);
  }
  /* aucun modèle de texte ne se déclare capable de voir */
  const texte = require('../src/data/catalog.json').models;
  assert.equal(texte.filter(m => M.isVisionModel(m)).length, 0);
  assert.equal([...ids].filter(id => texte.some(m => m.id === id)).length, 0, 'pas de collision d identifiant avec le catalogue de texte');
});

test('vision : la fonction ne propose que des modèles de vision, même parmi les installés', () => {
  const v = require('../src/data/vision.json').models;
  const defs = Object.fromEntries([...require('../src/data/catalog.json').models, ...v].map(m => [m.id, m]));
  const inst = ['qwen05b', v[0].id];
  assert.deepEqual(M.candidatesFor('vision', inst, defs), [v[0].id]);
  assert.ok(M.candidatesFor('rapide', inst, defs).includes('qwen05b'));
});
