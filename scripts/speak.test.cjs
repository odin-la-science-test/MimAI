// Tests du nettoyage du texte pour la lecture vocale (src/services/speak.ts). Lancer : npm run test:speak
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./_ts-loader.cjs');
const S = load('src/services/speak.ts');

test('markdown : titres, gras, puces et code ne sont pas lus', () => {
  const t = S.cleanForSpeech('# Titre\n**Important** : voici _un_ conseil.\n- premier\n- second\n`code` ok');
  assert.ok(!/[#*_`]/.test(t), t);
  assert.match(t, /Titre/); assert.match(t, /Important/); assert.match(t, /premier/); assert.match(t, /code ok/);
});

test('blocs de code remplaces, liens et emojis retires', () => {
  const t = S.cleanForSpeech('Voir [la doc](https://exemple.fr/x) ou https://exemple.fr/y 😀 ```js\nlet a = 1;\n``` fin');
  assert.ok(!t.includes('http')); assert.ok(!t.includes('😀')); assert.ok(!t.includes('let a'));
  assert.match(t, /la doc/); assert.match(t, /extrait de code/); assert.match(t, /fin/);
});

test('sauts de ligne -> pauses, espaces normalises, vide -> vide', () => {
  assert.equal(S.cleanForSpeech('Un.\n\nDeux   trois'), 'Un. Deux trois');
  assert.equal(S.cleanForSpeech(''), '');
  assert.equal(S.cleanForSpeech('   \n  '), '');
  assert.equal(S.cleanForSpeech(null), '');
});

test('decoupage : aucun morceau au-dela de la limite, sans perte de texte, coupes en fin de phrase', () => {
  const phrase = 'Ceci est une phrase de test assez longue pour faire du volume. ';
  const text = phrase.repeat(200).trim();
  const parts = S.chunkForSpeech(text, 500);
  assert.ok(parts.length > 1);
  parts.forEach(p => assert.ok(p.length <= 500, 'longueur ' + p.length));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
  parts.slice(0, -1).forEach(p => assert.match(p, /\.$/));
});

test('decoupage : texte court = un seul morceau ; mot unique tres long ne boucle pas', () => {
  assert.deepEqual(S.chunkForSpeech('Bonjour.'), ['Bonjour.']);
  const long = 'a'.repeat(1200);
  const parts = S.chunkForSpeech(long, 500);
  assert.equal(parts.join(''), long);
  assert.ok(parts.every(p => p.length <= 500));
});

test('hors application native : speakAvailable est faux et speak ne plante pas', () => {
  assert.equal(S.speakAvailable(), false);
  assert.equal(S.speak('Bonjour'), false);
  assert.doesNotThrow(() => S.stopSpeaking());
});

test('choix de voix : seules les voix françaises, les meilleures d abord, noms lisibles', () => {
  const S2 = require('./_ts-loader.cjs')('src/services/speak.ts');
  const v = S2.pickVoices([
    { identifier: 'en-us-x', language: 'en-US', quality: 'Enhanced' },
    { identifier: 'fr-fr-b', language: 'fr-FR', quality: 'Default' },
    { identifier: 'fr-ca-a', language: 'fr-CA', quality: 'Enhanced' },
    { identifier: 'fr-fr-a', language: 'fr_FR', quality: 'Enhanced' },
    { language: 'fr-FR' },
  ]);
  assert.deepEqual(v.map(x => x.id), ['fr-fr-a', 'fr-ca-a', 'fr-fr-b']);
  assert.match(v[0].label, /^Voix 1 · France · haute qualité$/);
  assert.match(v[2].label, /^Voix 3 · France$/);
  assert.deepEqual(S2.pickVoices([]), []);
  assert.ok(S2.VOICE_STYLES.length >= 4 && S2.VOICE_STYLES.every(s => s.rate >= 0.5 && s.rate <= 2 && s.pitch >= 0.5 && s.pitch <= 2));
});
