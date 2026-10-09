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

test('le catalogue réel : aucun modèle de vision déclaré, donc la fonction Vision reste honnêtement vide', () => {
  const cat = require('../src/data/catalog.json').models;
  assert.equal(cat.filter(m => M.isVisionModel(m)).length, 0);
});
