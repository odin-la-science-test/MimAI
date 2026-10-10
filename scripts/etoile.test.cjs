// Données de l'étoile de Mìmir (modules/mimir-overlay/android/src/main/assets/etoile.json). Lancer : npm run test:etoile
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'modules/mimir-overlay/android/src/main/assets/etoile.json');
const D = JSON.parse(fs.readFileSync(FILE, 'utf8'));

test('156 animations, 12 familles de 13, durées <= 2,8 s', () => {
  assert.equal(D.anims.length, 156);
  const fam = {};
  D.anims.forEach(a => { fam[a.fam] = (fam[a.fam] || 0) + 1; assert.ok(a.d > 0 && a.d <= 2.8, a.id); });
  assert.equal(Object.keys(fam).length, 12);
  Object.values(fam).forEach(n => assert.equal(n, 13));
  assert.equal(new Set(D.anims.map(a => a.id)).size, 156, 'identifiants uniques');
});

test('chaque animation a 15 valeurs par image, finies, et des yeux valides', () => {
  for (const a of D.anims) {
    assert.equal(a.f.length, a.frames * 15, a.id);
    assert.equal(a.frames, Math.max(2, Math.ceil(a.d * D.fps)), a.id);
    a.f.forEach(v => assert.ok(Number.isFinite(v), a.id));
    for (let i = 0; i < a.frames; i++) {
      const e = a.f[i * 15 + 14];
      assert.ok(Number.isInteger(e) && e >= 0 && e < D.eyeNames.length, a.id + ' yeux image ' + i);
      assert.ok(a.f[i * 15 + 7] >= 0 && a.f[i * 15 + 7] <= 1.0001, a.id + ' opacité');
    }
  }
});

test('effets : formes, couleurs et textes référencés existent', () => {
  let n = 0;
  for (const a of D.anims) {
    if (a.g) assert.equal(a.g.length, a.frames);
    if (!a.fx) continue;
    assert.equal(a.fx.length, a.frames, a.id);
    for (const items of a.fx) for (const it of items) {
      n++;
      assert.ok(it.length === 8 || it.length === 9, a.id);
      assert.ok(it[0] >= 0 && it[0] <= 3);
      assert.ok(it[7] >= 0 && it[7] < D.colors.length, a.id + ' couleur');
      if (it[0] <= 1) assert.ok(it[1] >= 0 && it[1] < D.shapes.length, a.id + ' forme');
      if (it[0] === 3) assert.ok(it[1] >= 0 && it[1] < D.texts.length, a.id + ' texte');
      it.forEach(v => assert.ok(Number.isFinite(v)));
    }
  }
  assert.ok(n > 1000, 'beaucoup d\'éléments d\'effets : ' + n);
});

test('formes : chemins absolus bien formés (M, L, Q, C, Z)', () => {
  const check = ops => {
    let i = 0, started = false;
    while (i < ops.length) {
      const c = ops[i];
      if (c === 0) { i += 3; started = true; } else if (c === 1) { assert.ok(started); i += 3; } else if (c === 2) { assert.ok(started); i += 5; }
      else if (c === 3) { assert.ok(started); i += 7; } else if (c === 4) { i += 1; } else assert.fail('opcode ' + c);
    }
    assert.equal(i, ops.length);
  };
  D.shapes.forEach(check); check(D.body);
  Object.values(D.eyes).forEach(list => list.forEach(e => { if (e.t === 'p') check(e.ops); }));
  assert.equal(D.shapes.length, D.shapeNames.length);
  assert.equal(Object.keys(D.eyes).length, 21);
});

test('animations utilisées par l\'app existent', () => {
  const ids = new Set(D.anims.map(a => a.id));
  ['coucou', 'ecoute', 'reflechit', 'message', 'eureka', 'confus', 'termine', 'erreur'].forEach(i => assert.ok(ids.has(i), i));
  D.tap.forEach(i => assert.ok(ids.has(i), 'tap ' + i));
  D.amb.forEach(i => assert.ok(ids.has(i), 'ambiance ' + i));
});

test('taille raisonnable (< 2 Mo)', () => {
  assert.ok(fs.statSync(FILE).size < 2 * 1024 * 1024);
});
