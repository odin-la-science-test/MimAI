// Garde-fous du jeu embarque (La Garde des Etoiles) : hors ligne strict, source a jour. Lancer : npm run test:game
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GARDE_HTML, GARDE_HTML_AI } from '../src/games/gardeHtml.ts';
import { CSP, build } from './embed-game.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root, 'assets/games/garde-des-etoiles.html'), 'utf8');

/* gabarit du jeu, decode (c'est une chaine JSON sur une seule ligne, apres la balise __bundler/template) */
function templateOf(html) {
  const lines = html.split('\n');
  const i = lines.findIndex(l => l.trim() === '<script type="__bundler/template">');
  assert.ok(i > 0, 'balise du gabarit introuvable');
  return { lines, i, tpl: JSON.parse(lines[i + 1].trim()) };
}

test('la page embarquee porte exactement une politique de securite (CSP)', () => {
  const n = (GARDE_HTML.match(/Content-Security-Policy/gi) || []).length;
  assert.equal(n, 1);
  assert.ok(GARDE_HTML.includes(CSP));
});

test('la CSP n interdit pas le jeu mais ferme le reseau : aucune origine http(s), aucun joker', () => {
  assert.doesNotMatch(CSP, /https?:/i);
  assert.doesNotMatch(CSP, /\*/);
  assert.match(CSP, /connect-src blob: data:(;|$)/);
  assert.match(CSP, /default-src 'none'/);
  assert.match(CSP, /form-action 'none'/);
});

test('le fichier genere est a jour par rapport a assets/games/garde-des-etoiles.html', () => {
  assert.equal(GARDE_HTML, build(src), 'relancer : node scripts/embed-game.mjs');
});

test('la page ne charge aucune ressource externe au demarrage (balises script/link/img distantes)', () => {
  const outer = GARDE_HTML.split('<script type="__bundler/manifest">')[0];
  assert.doesNotMatch(outer, /<(script|link|img|iframe)[^>]+(src|href)=["']https?:/i);
});

test('React et ReactDOM sont embarques : chaque ressource externe declaree est remplacee par un blob local', () => {
  const ext = GARDE_HTML.split('<script type="__bundler/ext_resources">')[1].split('</script>')[0];
  const list = JSON.parse(ext.trim());
  assert.ok(list.length >= 2);
  const inattendues = [...new Set(list.map(e => e.id))].filter(u => !u.startsWith('https://unpkg.com/react@18.3.1/umd/') && !u.startsWith('https://unpkg.com/react-dom@18.3.1/umd/'));
  assert.deepEqual(inattendues, [], 'seuls React et ReactDOM sont attendus comme ressources externes (embarquees)');
  list.forEach(e => assert.match(e.uuid, /^[0-9a-f-]{36}$/));
  const manifest = JSON.parse(GARDE_HTML.split('<script type="__bundler/manifest">')[1].split('</script>')[0].trim());
  list.forEach(e => assert.ok(manifest[e.uuid], 'ressource ' + e.id + ' embarquee dans le manifeste'));
});

test('le gabarit du jeu ne contient aucun "</script" brut (sinon le navigateur coupe le gabarit en deux)', () => {
  const { lines, i, tpl } = templateOf(GARDE_HTML);
  const tplLine = lines[i + 1];
  assert.doesNotMatch(tplLine, /<\/script/i);
  assert.doesNotMatch(tplLine, /<!--/);
  assert.match(tpl, /<\/script>/i);                              // le contenu d'origine est conserve apres decodage
  assert.equal(lines[i + 2].trim(), '</script>', 'la balise se ferme juste apres la ligne du gabarit');
});

test('IA de combat : branchee seulement si le jeu a un mode Defi ; sinon aucun correctif, jeu inchange', () => {
  const { tpl } = templateOf(GARDE_HTML);
  if (!GARDE_HTML_AI) {
    assert.equal((tpl.match(/aiLLM/g) || []).length, 0, 'aucun correctif d IA quand le mode Defi est absent');
    assert.equal((tpl.match(/MIMAI_AI/g) || []).length, 0);
    assert.doesNotMatch(tpl, /ReactNativeWebView/);
    return;
  }
  assert.equal((tpl.match(/aiLLM\(b, now\) \{/g) || []).length, 1);
  assert.equal((tpl.match(/if \(this\.aiLLM\(b, now\)\) return;/g) || []).length, 1);
  assert.equal((tpl.match(/window\.MIMAI_AI/g) || []).length, 4);
  assert.match(tpl, /window\.ReactNativeWebView\.postMessage/);
});

test('detection du mode Defi : les correctifs echouent bruyamment si le jeu change a moitie', async () => {
  const { patchTemplate, hasDefiAi } = await import('./game-patch.mjs');
  assert.equal(hasDefiAi('un jeu sans mode defi'), false);
  assert.throws(() => patchTemplate('rien'), /ancre trouvee 0 fois/);
  assert.throws(() => patchTemplate('\n  ai(b, now) {\n\n  ai(b, now) {\n  start(mode, lvl) {\n'), /ancre trouvee 2 fois/);
});

test('hors ligne : aucun appel reseau dans le jeu (hors lecture de ressources locales blob/data)', () => {
  const { tpl } = templateOf(GARDE_HTML);
  assert.doesNotMatch(tpl, /XMLHttpRequest|new WebSocket|sendBeacon|new EventSource/);
  assert.doesNotMatch(tpl, /fetch\(\s*['"`]https?:/, 'aucun fetch vers une adresse http(s) ecrite en dur');
  assert.equal((tpl.match(/x-import|text\/babel|text\/jsx/g) || []).length, 0, 'pas de module JSX distant (Babel serait telecharge)');
});

test('les scripts embarques (decompresses) ne contiennent aucun acces reseau autre que la lecture locale du moteur', () => {
  const manifest = JSON.parse(GARDE_HTML.split('<script type="__bundler/manifest">')[1].split('</script>')[0].trim());
  const scripts = [];
  for (const a of Object.values(manifest)) {
    if (!/javascript/.test(a.mime)) continue;
    let buf = Buffer.from(a.data, 'base64');
    if (a.compressed) buf = gunzipSync(buf);
    scripts.push(buf.toString('utf8'));
  }
  assert.ok(scripts.length >= 8, 'les scripts du jeu sont presents : ' + scripts.length);
  const jeu = scripts.filter(t => !/@license React/.test(t));          // React / ReactDOM : bibliotheques tierces connues
  assert.ok(jeu.length >= 6);
  for (const t of jeu) {
    assert.doesNotMatch(t, /XMLHttpRequest|new WebSocket|sendBeacon|new EventSource|importScripts\(/);
    assert.doesNotMatch(t, /fetch\(\s*['"`]https?:/);
  }
  /* les seuls fetch() sont ceux du moteur du jeu (lecture de blobs locaux / de la page elle-meme), pas d'adresse distante en dur */
  const avecFetch = jeu.filter(t => /fetch\(/.test(t));
  assert.ok(avecFetch.length <= 1, 'fetch() uniquement dans le moteur du jeu');
  avecFetch.forEach(t => assert.match(t, /dc-runtime|bundledBlob/));
});
