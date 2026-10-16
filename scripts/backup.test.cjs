// Sauvegarde / restauration : fusion sans écrasement, validation, pas de photos ni de clés. Lancer : npm run test:backup
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./_ts-loader.cjs');
const B = load('src/services/backup.ts');
let n = 0; const id = p => p + '_new' + (++n);
const mk = () => ({
  convs: [{ id: 'c1', title: 'Recettes', ts: 100, trainFlag: 'yes', msgs: [{ id: 'm1', role: 'user', text: 'Une tarte ?', ts: 1, image: 'file://x.jpg' }, { id: 'm2', role: 'ai', text: 'Oui !', ts: 2 }] }],
  memories: [{ id: 'k1', text: 'Je préfère les réponses courtes', kind: 'préférence', ts: 5, enabled: true }],
  docs: [{ id: 'd1', name: 'notes.txt', type: 'TXT', sizeMb: 0.1, addedAt: 1, text: 'bonjour', indexed: true, chunks: [{ i: 0, text: 'bonjour', page: '1' }] }],
  tex: [{ id: 't1', q: 'Salut', base: 'a', target: 'Bonjour !', tags: ['ton'], ts: 3, src: 'manual' }],
});

test('export : tout y est, sans photos ni index', () => {
  const b = B.buildBackup(mk(), 1000);
  assert.equal(b.app, 'MiMai'); assert.equal(b.v, 1);
  assert.equal(b.convs[0].msgs[0].image, null);
  assert.equal(b.docs[0].chunks, undefined);
  assert.equal(JSON.stringify(b).includes('file://'), false);
});

test('import sur un téléphone vide : tout est restauré, document à ré-indexer', () => {
  const b = JSON.parse(JSON.stringify(B.buildBackup(mk())));
  const d = { convs: [], memories: [], docs: [], tex: [] };
  const r = B.mergeBackup(d, b, id);
  assert.deepEqual(r, { convs: 1, memories: 1, docs: 1, tex: 1 });
  assert.equal(d.docs[0].indexed, false);
  assert.equal(d.convs[0].msgs.length, 2);
});

test('import sur les mêmes données : aucun doublon ; collisions d\'identifiants réglées', () => {
  const d = mk();
  const b = JSON.parse(JSON.stringify(B.buildBackup(mk())));
  assert.deepEqual(B.mergeBackup(d, b, id), { convs: 0, memories: 0, docs: 0, tex: 0 });
  const b2 = JSON.parse(JSON.stringify(B.buildBackup(mk())));
  b2.convs[0].title = 'Autre'; b2.convs[0].ts = 999;      // même id « c1 », autre discussion
  const r = B.mergeBackup(d, b2, id);
  assert.equal(r.convs, 1);
  assert.equal(new Set(d.convs.map(c => c.id)).size, 2);
});

test('fichier invalide ou hostile : refus net ou contenu assaini', () => {
  const d = { convs: [], memories: [], docs: [], tex: [] };
  assert.match(B.mergeBackup(d, { app: 'Autre' }, id).error, /pas une sauvegarde/);
  assert.match(B.mergeBackup(d, null, id).error, /pas une sauvegarde/);
  const r = B.mergeBackup(d, { app: 'MiMai', v: 1, convs: [{ title: 5, msgs: [{ role: 'x', text: 'ok' }, { text: '' }, 7] }, 'zzz'], memories: [{ text: '  ' }, { text: 'a', kind: 'bizarre' }], docs: [{ name: 'x' }], tex: [{ q: 'q' }] }, id);
  assert.deepEqual(r, { convs: 1, memories: 1, docs: 0, tex: 0 });
  assert.equal(d.memories[0].kind, 'préférence'); assert.equal(d.convs[0].msgs[0].role, 'ai');
});
