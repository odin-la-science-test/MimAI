// Embarque un jeu HTML autonome dans l'app :
//   1. applique les correctifs de scripts/game-patch.mjs (IA de combat = modele local de MiMai) ;
//   2. injecte une politique de securite (CSP) qui INTERDIT tout acces reseau ;
//   3. ecrit src/games/<nom>Html.ts (chaine) pour l'afficher dans une WebView hors ligne.
// Usage : node scripts/embed-game.mjs [--serve]   (--serve ecrit aussi une copie testable dans un navigateur : %TEMP%/garde-test/index.html)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchTemplate, hasDefiAi } from './game-patch.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES = [{ file: 'assets/games/garde-des-etoiles.html', out: 'src/games/gardeHtml.ts', name: 'GARDE_HTML' }];

/* Le jeu n'a besoin que de contenu local (blob:, data:). connect-src sans http(s) : fetch/XHR/WebSocket vers Internet sont refuses. */
export const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob: data:",
  "style-src 'unsafe-inline' blob: data:",
  "img-src data: blob:",
  "font-src data: blob:",
  "media-src data: blob:",
  "connect-src blob: data:",
  "worker-src blob:",
  "frame-src blob: data: about:",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

/* Le gabarit du jeu est une chaine JSON dans une balise <script> : on la re-serialise SANS jamais produire
   « </script » ni « <!-- » (qui fermeraient ou perturberaient la balise). */
const BS = String.fromCharCode(92);   // une barre oblique inverse
const SLASH = String.fromCharCode(47);
function serializeTemplate(s) {
  return JSON.stringify(s)
    // </script  ->  <BS/script  (JSON valide) : sans cela le navigateur ferme la balise <script> du gabarit trop tot
    .replace(new RegExp('<' + SLASH + '(script)', 'gi'), (_m, t) => '<' + BS + SLASH + t)
    // <!--  ->  BS u003c !--  (JSON valide)
    .replace(new RegExp('<!' + '--', 'g'), () => BS + 'u003c!' + '--');
}

/* retourne le HTML final et si l'IA de combat (mode Defi) a pu etre branchee */
export function buildGame(src) {
  if (/Content-Security-Policy/i.test(src)) throw new Error('CSP deja presente');
  const lines = src.split('\n');
  const i = lines.findIndex(l => l.trim() === '<script type="__bundler/template">');
  if (i < 0) throw new Error('gabarit du jeu introuvable');
  const tpl = JSON.parse(lines[i + 1].trim());
  const ai = hasDefiAi(tpl);   // le mode Defi n'existe pas dans toutes les versions du jeu
  lines[i + 1] = serializeTemplate(ai ? patchTemplate(tpl) : tpl);
  let html = lines.join('\n');
  if (!/<head>/i.test(html)) throw new Error('balise <head> introuvable');
  html = html.replace(/<head>/i, '<head>\n  <meta http-equiv="Content-Security-Policy" content="' + CSP + '">');
  return { html, ai };
}

export const build = src => buildGame(src).html;

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  for (const g of GAMES) {
    const { html, ai } = buildGame(readFileSync(resolve(root, g.file), 'utf8'));
    const ts = '/* GENERE par scripts/embed-game.mjs depuis ' + g.file + ' : ne pas modifier a la main. */\n'
      + 'export const ' + g.name + ' = ' + JSON.stringify(html) + ';\n'
      + '/* vrai si le jeu a un mode Defi dont l IA a ete branchee sur le modele local de MiMai */\n'
      + 'export const ' + g.name + '_AI = ' + ai + ';\n';
    writeFileSync(resolve(root, g.out), ts);
    console.log(g.out, '<-', g.file, '(' + html.length + ' caracteres, CSP' + (ai ? ', IA de combat branchee' : ', aucune IA a brancher : mode Defi absent') + ')');
    if (process.argv.includes('--serve')) {
      const d = resolve(process.env.TEMP || '/tmp', 'garde-test'); mkdirSync(d, { recursive: true });
      writeFileSync(resolve(d, 'index.html'), html); console.log('copie de test :', resolve(d, 'index.html'));
    }
  }
}
