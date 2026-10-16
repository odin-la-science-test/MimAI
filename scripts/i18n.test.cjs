// Interface bilingue : traduction exacte, repli sur le français, langue automatique. Lancer : npm run test:i18n
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./_ts-loader.cjs');
const I = load('src/i18n/index.ts');
const { EN } = load('src/i18n/en.ts');

test('français : texte inchangé ; anglais : traduit, avec repli sur le français', () => {
  I.setLang('fr'); assert.equal(I.tr('Réessayer'), 'Réessayer'); assert.equal(I.bi('a', 'b'), 'a');
  I.setLang('en');
  assert.equal(I.tr('Réessayer'), 'Try again');
  assert.equal(I.tr(' Réessayer '), ' Try again ');
  assert.equal(I.tr('Texte inconnu du dictionnaire'), 'Texte inconnu du dictionnaire');
  assert.equal(I.bi('a', 'b'), 'b');
});

test('réglage Auto : suit la langue du téléphone ; choix explicites respectés', () => {
  I.setLang('auto'); assert.ok(['fr', 'en'].includes(I.getLang()));
  I.setLang('fr'); assert.equal(I.getLang(), 'fr');
  I.setLang('en'); assert.equal(I.getLang(), 'en');
});

test('dictionnaire : aucune traduction vide, aucune clé identique à sa traduction (sauf noms propres)', () => {
  const same = Object.entries(EN).filter(([k, v]) => !v.trim() || (k === v && !['Chats', 'Code', 'Note', 'Local', 'Description', 'Conversations', 'Documents'].includes(k)));
  assert.deepEqual(same, []);
  assert.ok(Object.keys(EN).length > 250);
});
