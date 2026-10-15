// Lecture des documents joints (Word, Excel, PowerPoint, PDF, texte) : tout sur l'appareil. Lancer : npm run test:docs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const Module = require('node:module');
const { zipSync, strToU8 } = require('fflate');

// faux expo-file-system (lecture de fichiers locaux)
const orig = Module._load;
Module._load = function (req, ...a) {
  if (req === 'expo-file-system/legacy') return { EncodingType: { UTF8: 'utf8', Base64: 'base64' }, readAsStringAsync: async (u, o) => fs.readFileSync(u).toString(o.encoding) };
  return orig.call(this, req, ...a);
};
const load = require('./_ts-loader.cjs');
const D = load('src/services/docExtract.ts');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mimai-doc-'));
const put = (n, data) => { const f = path.join(tmp, n); fs.writeFileSync(f, data); return f; };

test('Word : paragraphes, tabulations et entités', async () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>Bonjour &amp; bienvenue</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Deuxième </w:t></w:r><w:r><w:tab/><w:t>ligne</w:t></w:r></w:p></w:body></w:document>';
  const f = put('a.docx', Buffer.from(zipSync({ 'word/document.xml': strToU8(xml), '[Content_Types].xml': strToU8('<x/>') })));
  const r = await D.extractFromFile(f, 'a.docx');
  assert.equal(r.kind, 'text'); assert.match(r.text, /Bonjour & bienvenue\nDeuxième \tligne/);
});

test('Excel : chaînes partagées et nombres, par ligne', async () => {
  const shared = '<sst><si><t>Nom</t></si><si><t>Âge</t></si><si><t>Léa</t></si></sst>';
  const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>31</v></c></row></sheetData></worksheet>';
  const f = put('a.xlsx', Buffer.from(zipSync({ 'xl/sharedStrings.xml': strToU8(shared), 'xl/worksheets/sheet1.xml': strToU8(sheet) })));
  const r = await D.extractFromFile(f, 'a.xlsx');
  assert.equal(r.kind, 'text'); assert.match(r.text, /Nom \| Âge\nLéa \| 31/);
});

test('PowerPoint : texte de chaque diapositive', async () => {
  const f = put('a.pptx', Buffer.from(zipSync({ 'ppt/slides/slide2.xml': strToU8('<p><a:p><a:t>Deux</a:t></a:p></p>'), 'ppt/slides/slide1.xml': strToU8('<p><a:p><a:t>Un</a:t></a:p></p>') })));
  const r = await D.extractFromFile(f, 'a.pptx');
  assert.match(r.text, /Diapositive 1\nUn[\s\S]*Diapositive 2\nDeux/);
});

function pdf(content, compress) {
  const stream = compress ? zlib.deflateSync(Buffer.from(content, 'latin1')) : Buffer.from(content, 'latin1');
  return Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length ' + stream.length + (compress ? ' /Filter /FlateDecode' : '') + ' >>\nstream\n'), stream, Buffer.from('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF')]);
}

test('PDF : texte simple (non compressé et compressé), tableaux TJ', async () => {
  const body = 'BT /F1 12 Tf 72 700 Td (Rapport annuel 2026) Tj T* [(Chiffre d\'affaires en hausse de ) -300 (12 %)] TJ ET';
  for (const c of [false, true]) {
    const f = put('p' + c + '.pdf', pdf(body.repeat(2), c));
    const r = await D.extractFromFile(f, 'p.pdf');
    assert.equal(r.kind, 'text', 'compress=' + c);
    assert.match(r.text, /Rapport annuel 2026/); assert.match(r.text, /Chiffre d'affaires en hausse de  12 %/);
  }
});

test('PDF : polices à codes (ToUnicode) et PDF sans texte → pas de charabia', async () => {
  const cmap = 'beginbfchar <0001> <0048> <0002> <0069> endbfchar';
  const body = 'BT <00010002> Tj ET '.repeat(40);
  const f = Buffer.concat([pdf(body, true), Buffer.from('\n1 0 obj\n<< /Length ' + cmap.length + ' >>\nstream\n' + cmap + '\nendstream\n')]);
  const r = await D.extractFromFile(put('c.pdf', f), 'c.pdf');
  assert.equal(r.kind, 'text'); assert.match(r.text, /Hi/);
  const empty = await D.extractFromFile(put('e.pdf', pdf('q 100 0 0 100 0 0 cm /Im0 Do Q', true)), 'e.pdf');
  assert.equal(empty.kind, 'none'); assert.equal(empty.canCloud, true);
});

test('texte, HTML, images, formats inconnus et anciens formats', async () => {
  assert.equal((await D.extractFromFile(put('n.md', '# Titre\n\nUn   texte.'), 'n.md')).kind, 'text');
  const h = await D.extractFromFile(put('h.html', '<html><style>x{}</style><p>Salut</p><script>alert(1)</script></html>'), 'h.html');
  assert.match(h.text, /Salut/); assert.doesNotMatch(h.text, /alert|x\{\}/);
  assert.equal((await D.extractFromFile('x', 'photo.JPG')).kind, 'image');
  assert.equal((await D.extractFromFile(put('z.bin', 'x'), 'z.bin')).kind, 'none');
  assert.match((await D.extractFromFile(put('o.doc', 'x'), 'o.doc')).reason, /docx/);
});

test('extrait : tout le document s\'il tient, sinon les passages proches de la question', () => {
  assert.equal(D.pickExcerpt('court', 'q', 100), 'court');
  const long = Array.from({ length: 200 }, (_, i) => (i === 120 ? 'La facture numéro 4412 concerne le client Dupont.' : 'Paragraphe de remplissage numéro ' + i + ' sans intérêt particulier.')).join('\n');
  const x = D.pickExcerpt(long, 'Quel est le montant de la facture du client Dupont ?', 600);
  assert.ok(x.length <= 700); assert.match(x, /facture numéro 4412/);
});
