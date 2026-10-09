// Tests de la detection des modeles deja installes (src/services/installed.ts). Lancer : npm run test:installed
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./_ts-loader.cjs');
const I = load('src/services/installed.ts');

const M = {
  petit: { sizeBytes: 500, sha256: 'a'.repeat(64) },
  moyen: { sizeBytes: 1000, sha256: 'b'.repeat(64) },
  jumeau: { sizeBytes: 1000, sha256: 'c'.repeat(64) },   // meme taille que « moyen » : seule l'empreinte les distingue
  gros: { sizeBytes: 4000, sha256: 'd'.repeat(64) },
};

test('detection : seule la taille EXACTE compte (fichier partiel, trop gros ou absent = pas installe)', () => {
  const infos = {
    petit: { exists: true, size: 500 },       // ok
    moyen: { exists: true, size: 999 },       // incomplet
    jumeau: { exists: true, size: 1001 },     // trop gros
    gros: { exists: false },                  // absent
  };
  assert.deepEqual(I.detectInstalled(M, infos), ['petit']);
  assert.deepEqual(I.detectInstalled(M, {}), []);
  assert.deepEqual(I.detectInstalled(M, { petit: { exists: true } }), [], 'taille inconnue = non detecte');
});

test('reconciliation : ajoute les fichiers valides non listes, retire ceux qui ont disparu', () => {
  const r = I.reconcile(['petit', 'gros'], ['petit', 'moyen'], 'gros', 'petit');
  assert.deepEqual(r.installed, ['petit', 'moyen']);
  assert.deepEqual(r.added, ['moyen']);
  assert.deepEqual(r.removed, ['gros']);
  assert.equal(r.activeModel, 'petit', 'le modele actif disparu est remplace par un modele installe');
});

test('reconciliation : modele actif valide conserve ; aucun fichier -> repli par defaut, liste vide', () => {
  assert.equal(I.reconcile(['petit', 'moyen'], ['petit', 'moyen'], 'moyen', 'petit').activeModel, 'moyen');
  const vide = I.reconcile(['petit'], [], 'petit', 'defaut');
  assert.deepEqual(vide.installed, []);
  assert.equal(vide.activeModel, 'defaut');
  assert.deepEqual(vide.removed, ['petit']);
});

test('reconciliation : idempotente et sans doublon', () => {
  const a = I.reconcile(['petit'], ['petit', 'moyen'], 'petit', 'petit');
  const b = I.reconcile(a.installed, ['petit', 'moyen'], a.activeModel, 'petit');
  assert.deepEqual(b.installed, a.installed);
  assert.deepEqual(b.added, []);
  assert.deepEqual(b.removed, []);
  assert.equal(new Set(a.installed).size, a.installed.length);
});

test('import : candidats par taille, puis le bon modele par empreinte SHA-256', () => {
  assert.deepEqual(I.candidatesBySize(M, 1000).sort(), ['jumeau', 'moyen']);
  assert.deepEqual(I.candidatesBySize(M, 12345), []);
  assert.equal(I.matchByHash(M, ['moyen', 'jumeau'], 'c'.repeat(64)), 'jumeau');
  assert.equal(I.matchByHash(M, ['moyen', 'jumeau'], 'B'.repeat(64)), 'moyen', 'insensible a la casse');
  assert.equal(I.matchByHash(M, ['moyen', 'jumeau'], 'f'.repeat(64)), null, 'fichier corrompu ou inconnu : refuse');
  assert.equal(I.matchByHash(M, [], 'a'.repeat(64)), null);
});

test('messages d echec : chaque cas a un texte clair, sans jargon technique brut', () => {
  for (const f of ['canceled', 'no-size', 'unknown-size', 'disk', 'copy', 'hash-mismatch', 'error']) {
    const t = I.describeImportFailure(f, 'x');
    assert.ok(typeof t === 'string' && t.length > 10, f);
  }
  assert.match(I.describeImportFailure('unknown-size'), /catalogue/);
  assert.match(I.describeImportFailure('hash-mismatch'), /SHA-256/);
  assert.match(I.describeImportFailure('disk', '120'), /120 Mo/);
});

test('catalogue reel : la detection reconnait chaque modele du catalogue a sa taille exacte', () => {
  const cat = require('../src/data/catalog.json').models;
  const models = Object.fromEntries(cat.map(m => [m.id, m]));
  const infos = Object.fromEntries(cat.map(m => [m.id, { exists: true, size: m.sizeBytes }]));
  assert.equal(I.detectInstalled(models, infos).length, cat.length);
  /* aucune collision de taille non resolue par l'empreinte : chaque (taille, sha) designe un seul modele */
  for (const m of cat) {
    const c = I.candidatesBySize(models, m.sizeBytes);
    assert.equal(I.matchByHash(models, c, m.sha256), m.id, m.id);
  }
});
