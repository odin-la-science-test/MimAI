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

test('huit langues : chaque liste a la longueur de ORDER, sans trou ; mêmes balises et ponctuation clés', () => {
  const L2 = require('./_ts-loader.cjs');
  const { ORDER } = L2('src/i18n/order.ts');
  const packs = { es: L2('src/i18n/es.ts').ES, hu: L2('src/i18n/hu.ts').HU, pt: L2('src/i18n/pt.ts').PT, ja: L2('src/i18n/ja.ts').JA, zh: L2('src/i18n/zh.ts').ZH, de: L2('src/i18n/de.ts').DE };
  for (const [k, p] of Object.entries(packs)) {
    assert.equal(p.length, ORDER.length, k);
    p.forEach((t, i) => { assert.ok(t && t.trim(), k + ' #' + i + ' vide'); assert.equal(/Mìmir|MiMai/.test(ORDER[i]) ? /M[iì]mir|MiMai|MIMAI/.test(t) : true, true, k + ' #' + i + ' : nom propre perdu'); });
  }
  /* repères : mêmes nombres (durées, tailles) dans la traduction */
  const nums = s => (s.match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(',', '.')).sort().join(',');
  for (const [k, p] of Object.entries(packs)) ORDER.forEach((e, i) => { if (/\d/.test(e)) assert.equal(nums(p[i]), nums(e), k + ' #' + i + ' : nombres différents (' + e + ')'); });
});

test('langues : traduction dans chacune, repli sur l anglais pour bi(), langue du téléphone reconnue', () => {
  const I2 = load('src/i18n/index.ts');
  const exp = { es: 'Reintentar', pt: 'Tentar de novo', de: 'Erneut versuchen', hu: 'Újra', ja: '再試行', zh: '重试', en: 'Try again', fr: 'Réessayer' };
  for (const [k, v] of Object.entries(exp)) { I2.setLang(k); assert.equal(I2.tr('Réessayer'), v, k); }
  I2.setLang('ja'); assert.equal(I2.bi('Compris', 'Got it'), 'わかりました'); assert.equal(I2.bi('x', 'Texte sans traduction'), 'Texte sans traduction');
  assert.equal(I2.LANGS.length, 8);
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
