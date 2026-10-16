#!/usr/bin/env node
// Génère docs/privacy/index.html (page publique de la politique de confidentialité, FR + EN) à partir de PRIVACY.md.
//   npm run privacy:page
// Publier : GitHub → Settings → Pages → « Deploy from a branch » → main, dossier /docs ; l'adresse est alors
// https://<utilisateur>.github.io/<depot>/privacy/ (à saisir dans la Play Console).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(resolve(ROOT, 'PRIVACY.md'), 'utf8').replace(/\r\n/g, '\n');
const old = readFileSync(resolve(ROOT, 'docs/privacy/index.html'), 'utf8');
const head = old.slice(0, old.indexOf('<main>') + 6);

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/([\w.+-]+@[\w-]+\.[\w.-]*\w)/g, m => '<a href="mailto:' + m + '">' + m + '</a>');

function render(lines) {
  const out = []; let list = false, para = [];
  const flush = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const closeList = () => { if (list) { out.push('</ul>'); list = false; } };
  for (const l of lines) {
    if (/^### /.test(l)) { flush(); closeList(); out.push('<h2>' + inline(l.slice(4)) + '</h2>'); }
    else if (/^- /.test(l)) { flush(); if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(l.slice(2)) + '</li>'); }
    else if (!l.trim()) { flush(); closeList(); }
    else para.push(l);
  }
  flush(); closeList();
  return out.join('\n');
}

const iFr = md.indexOf('\n## Français'), iEn = md.indexOf('\n## English');
const intro = md.slice(0, iFr).split('\n').filter(l => l.startsWith('*Derni'));
const fr = md.slice(iFr + 1, iEn).split('\n').slice(1).filter(l => l.trim() !== '---');
const en = md.slice(iEn + 1).split('\n').slice(1).filter(l => l.trim() !== '---');
const title = md.split('\n')[0].replace(/^# /, '');
const html = head + `
<h1>${esc(title)}</h1>
<div class="nav"><a href="#fr">Français</a><a href="#en">English</a></div>
<section id="fr"><h2 style="font-size:1.4rem;color:var(--olive)">Français</h2>
${render(intro)}
${render(fr)}
</section>
<section id="en"><h2 style="font-size:1.4rem;color:var(--olive)">English</h2>
${render(en)}
</section>
</main></body></html>
`;
writeFileSync(resolve(ROOT, 'docs/privacy/index.html'), html);
console.log('docs/privacy/index.html régénéré (' + html.length + ' octets)');
