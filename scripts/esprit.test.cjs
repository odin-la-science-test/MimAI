// L'esprit gardien : les animations « cuites » (esprit.json) sont complètes et lisibles par le module Android. Lancer : npm run test:esprit
// (après `npm run esprit:bake`). Vérifie les contrats que EspritData.kt suppose : champs, taille des images, formes, couleurs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'modules/mimir-overlay/android/src/main/assets/esprit.json');
const D = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const FIELDS = ['x', 'y', 'r', 'pr', 'ht', 'hh', 'wl', 'wr', 'wg', 'wf', 'ex', 'ey', 'eg', 'lid', 'bl', 'br', 'ba', 'rg', 'r1', 'r2', 'r3', 'rr', 'ag', 'hc', 'blink', 's', 'sx', 'sy', 'op', 'bop', 'ws', 'es', 'rs', 'bo', 'hold'];

test('156 mouvements + les mouvements d\'ouverture, dans l\'ordre de champs attendu par Kotlin', () => {
  assert.deepEqual(D.fields, FIELDS);
  assert.equal(D.stride, FIELDS.length + 4);
  assert.equal(D.anims.filter(a => a.fam !== 'extra').length, 156);
  for (const id of ['arrivee', 'depart', 'vole_bulle', 'pose_bulle', 'rentre', 'coucou', 'scrute', 'pensif', 'message']) assert.ok(D.anims.some(a => a.id === id), 'manque ' + id);
  assert.equal(D.fams.length, 12);
});

test('chaque animation : images complètes, valeurs finies, durée ≤ 2,8 s, effets cohérents', () => {
  for (const a of D.anims) {
    assert.equal(a.f.length, a.frames * D.stride, a.id);
    assert.ok(a.f.every(Number.isFinite), a.id);
    assert.ok(a.d > 0 && (a.fam === 'extra' || a.d <= 2.8), a.id);
    if (a.fx) {
      assert.equal(a.fx.length, a.frames, a.id);
      for (const fr of a.fx) for (const it of fr) {
        assert.equal(it.length, 11, a.id);
        assert.ok(it.every(Number.isFinite) && it[0] >= 0 && it[0] <= 4, a.id);
        if (it[0] <= 1) assert.ok(it[1] >= 0 && it[1] < D.shapeNames.length, a.id);
        if (it[0] !== 4 && it[0] !== 3 || it[0] === 3) assert.ok(it[8] >= 0 && it[8] < D.hex.length, a.id);
      }
    }
  }
});

test('yeux : toutes les expressions utilisées existent ; formes de base présentes', () => {
  for (const a of D.anims) for (let i = 0; i < a.frames; i++) {
    const e = a.f[i * D.stride + D.stride - 1];
    assert.ok(Number.isInteger(e) && e >= 0 && e < D.eyeKeys.length, a.id);
  }
  for (const n of ['open', 'happy', 'closed', 'eteint']) assert.ok(D.eyes[n], n);
  assert.equal(D.feath.length, 3); assert.equal(D.runes.length, 3);
  assert.ok(D.rim.length > 4 && D.void.length > 4 && D.brow.length > 4 && D.ghost.length > 4);
  for (const k of ['c1', 'c5', 'cy', 'vd', 'pu', 'h1', 'h4', 'r1', 'r3', 'wh', 'in', 'c8']) assert.ok(D.hexKeys.includes(k), k);
});
