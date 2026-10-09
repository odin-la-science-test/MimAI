// Tests de la logique pure de secousse (src/shake.ts) et du choix de réaction (src/motion.ts).
// Exécution : npm run test:shake   (Node >= 22.18 / 24, type-stripping natif)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShakeDetector, shakeForce, SHAKE_DEFAULTS } from '../src/shake.ts';
import { pickReaction, SHAKE_REACTIONS, MOVES, moveIndex, moveOnceMs, parseSpec } from '../src/motion.ts';

/* échantillons à ~80 ms : repos (1 g de pesanteur) ou coup fort */
const REST = [0, 0, 1], HIT = [1.8, 1.4, 1.2]; // ‖HIT‖ ≈ 2.55 g → force ≈ 1.55
const run = (det, samples, t0 = 1000, dt = 80) => samples.map((s, i) => det.push(...s, t0 + i * dt));

test('la pesanteur seule ne déclenche rien', () => {
  const det = createShakeDetector();
  assert.ok(shakeForce(...REST) < 0.01);
  assert.ok(run(det, Array(200).fill(REST)).every(r => r === false));
});

test('un seul choc (téléphone posé sur une table) ne suffit pas', () => {
  const det = createShakeDetector();
  assert.ok(run(det, [REST, HIT, REST, REST, REST]).every(r => r === false));
});

test('seuil : coups juste en dessous ignorés, au-dessus comptés', () => {
  const low = [0, 0, 1 + SHAKE_DEFAULTS.threshold - 0.05];
  const det = createShakeDetector();
  assert.ok(run(det, Array(20).fill(low)).every(r => r === false));
  const hi = [0, 0, 1 + SHAKE_DEFAULTS.threshold + 0.05];
  const det2 = createShakeDetector();
  assert.ok(run(det2, Array(6).fill(hi), 1000, 130).some(Boolean));
});

test('3 coups rapprochés dans la fenêtre = secousse, une seule fois', () => {
  const det = createShakeDetector();
  const r = run(det, [HIT, REST, HIT, REST, HIT, REST, HIT, REST, HIT], 1000, 120);
  assert.equal(r.filter(Boolean).length, 1);
});

test('coups trop espacés (> fenêtre) : pas de secousse', () => {
  const det = createShakeDetector({ windowMs: 1000 });
  const t = [1000, 2500, 4000, 5500];
  assert.ok(t.map(x => det.push(...HIT, x)).every(r => r === false));
});

test('un même geste (échantillons consécutifs à 20 ms) compte pour un seul coup', () => {
  const det = createShakeDetector();
  const r = run(det, Array(10).fill(HIT), 1000, 20); // 200 ms au total : ≤ 2 coups possibles avec minGap 110 ms
  assert.ok(r.every(x => x === false));
});

test('anti-rebond : une fois déclenchée, silence pendant cooldownMs puis ré-armement', () => {
  const det = createShakeDetector({ cooldownMs: 2000 });
  let t = 1000, fired = 0;
  for (let i = 0; i < 12; i++, t += 120) if (det.push(...HIT, t)) fired++; // secousse continue 1,4 s
  assert.equal(fired, 1);
  // encore en secouant juste après le cooldown : une 2e secousse part
  t += 2000; let again = 0;
  for (let i = 0; i < 6; i++, t += 120) if (det.push(...HIT, t)) again++;
  assert.equal(again, 1);
});

test('données invalides et horloge qui recule ne plantent pas', () => {
  const det = createShakeDetector();
  assert.equal(det.push(NaN, 0, 1, 1000), false);
  assert.equal(det.push(...HIT, 5000), false);
  assert.equal(det.push(...HIT, 100), false); // retour en arrière : reset
  det.reset();
});

test('pickReaction : toujours valide et jamais la même deux fois de suite', () => {
  let last = -1;
  for (let k = 0; k < 500; k++) {
    const i = pickReaction(last);
    assert.ok(i >= 0 && i < SHAKE_REACTIONS.length);
    if (k > 0) assert.notEqual(i, last);
    last = i;
  }
  /* couverture : toutes les réactions sortent */
  const seen = new Set(); last = -1;
  for (let k = 0; k < 500; k++) { last = pickReaction(last); seen.add(last); }
  assert.equal(seen.size, SHAKE_REACTIONS.length);
});

test('chaque réaction existe dans MOVES, est marquée shake et a une durée de lecture finie', () => {
  for (const r of SHAKE_REACTIONS) {
    const i = MOVES.findIndex(m => m.n === r.n);
    assert.ok(i >= 0, r.n);
    assert.ok(MOVES[i].shake, r.n + ' doit être flaggé shake');
    const ms = moveOnceMs(MOVES[i], r.rep);
    assert.ok(ms >= 800 && ms <= 6000, `${r.n}: ${ms} ms`);
  }
  assert.equal(moveIndex('Atchoum') >= 60, true);
});

test('specs : « prim durée délai n » analysé, spec inconnue refusée', () => {
  assert.deepEqual(parseSpec('fWoozy 1.2 0 3'), { prim: 'fWoozy', dur: 1200, delay: 0, n: 3 });
  assert.equal(parseSpec('nimporte 1'), null);
  for (const m of MOVES) for (const k of ['f', 'l', 'r', 'b', 'h', 's', 'e']) if (m[k]) assert.ok(parseSpec(m[k]), `${m.n}.${k} = ${m[k]}`);
});
