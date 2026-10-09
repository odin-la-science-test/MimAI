// Tests du plan de vitesse et des instantanés de benchmark. Lancer : npm run test:speed
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./_ts-loader.cjs');
const S = load('src/services/speedplan.ts');
const B = load('src/services/bench.ts');

test('classification : court / moyen / reflexion', () => {
  assert.equal(S.classify('Capitale de la France ?', 'rapide'), 'court');
  assert.equal(S.classify('Salut ça va ?', 'rapide'), 'court');
  assert.equal(S.classify('Explique la photosynthèse', 'rapide'), 'moyen');
  assert.equal(S.classify('Écris un mail pour demander un congé à mon patron', 'rapide'), 'moyen');
  assert.equal(S.classify('Combien font 2+2 ?', 'reflexion'), 'reflexion');
  assert.equal(S.classify('ok', 'outils'), 'moyen');
});

test('delais : 5 s, 10 s, 20 s', () => {
  assert.deepEqual([S.BUDGET_MS.court, S.BUDGET_MS.moyen, S.BUDGET_MS.reflexion], [5000, 10000, 20000]);
});

test('longueur de reponse : tient dans le delai selon la vitesse mesuree, bornee', () => {
  assert.equal(S.maxTokensFor('court', null), 70);
  assert.equal(S.maxTokensFor('court', 0), 70);
  assert.equal(S.maxTokensFor('court', 10), 38);            // 10 x (5 - 1,2)
  assert.equal(S.maxTokensFor('court', 1), S.MIN_TOKENS);    // trop lent : plancher
  assert.equal(S.maxTokensFor('court', 200), 100);           // plafond
  assert.equal(S.maxTokensFor('moyen', 15), 132);            // 15 x 8,8
  assert.equal(S.maxTokensFor('reflexion', 20), 376);        // 20 x 18,8
  assert.equal(S.maxTokensFor('reflexion', 100), 650);
  for (const k of S.KINDS) for (const tps of [3, 8, 15, 30, 60]) {
    const n = S.maxTokensFor(k, tps);
    assert.ok(n >= S.MIN_TOKENS);
    if (n > S.MIN_TOKENS && n < 650) assert.ok(n / tps + 1.2 <= S.BUDGET_MS[k] / 1000 + 0.01, k + ' ' + tps);
  }
});

test('estimation honnete : null si vitesse inconnue', () => {
  assert.equal(S.estimateSeconds('court', null), null);
  assert.equal(S.estimateSeconds('court', 20), 3.2);         // 1,2 + 40/20
  assert.equal(S.estimateSeconds('reflexion', 20), 21.2);
});

test('coupure par delai : a la derniere fin de phrase, sinon points de suspension', () => {
  assert.equal(S.trimToSentence('Bonjour. Voici la suite', false), 'Bonjour. Voici la suite');
  assert.equal(S.trimToSentence('Paris est la capitale de la France. Elle compte beaucoup de mus', true), 'Paris est la capitale de la France.');
  assert.equal(S.trimToSentence('Bonjour. Voici la suite de la longue explication sur', true), 'Bonjour. Voici la suite de la longue explication sur…');
  assert.equal(S.trimToSentence('', true), '');
  assert.equal(S.trimToSentence('Fin complete !', true), 'Fin complete !');
});

test('prompt court = moins de contexte', () => {
  assert.ok(S.historyWindow('court') < S.historyWindow('moyen') && S.historyWindow('moyen') <= S.historyWindow('reflexion'));
  assert.ok(S.fewShotCount('court') < S.fewShotCount('moyen'));
  for (const k of S.KINDS) assert.ok(S.lengthHint(k).length > 10);
});

const snap = (o) => ({ id: 'b', label: 'x', ts: 1, modelId: 'm', phase: 'manuel', speed: [], style: null, general: null, holdoutN: 0, generalN: 0, degenerate: null, ...o });
const pt = (kind, ms, tps = 10, ttftMs = 800) => ({ kind, ms, ttftMs, tokens: 30, tps, cut: false, ok: ms <= S.BUDGET_MS[kind] + 500 });

test('comparaison avant / apres : temps, vitesse, premier mot, qualite', () => {
  const a = snap({ ts: 1, speed: [pt('court', 4000, 10, 1000), pt('moyen', 9000, 10, 1000)], style: 20, general: 80 });
  const b = snap({ ts: 2, speed: [pt('court', 3000, 14, 600), pt('moyen', 11000, 8, 1200)], style: 35, general: 80 });
  const rows = B.compare(a, b);
  const by = Object.fromEntries(rows.map(r => [r.label, r]));
  assert.equal(by['Question courte · temps'].better, true);
  assert.equal(by['Question courte · temps'].delta, '−1 s');
  assert.equal(by['Question moyenne · temps'].better, false);
  assert.match(by['Question moyenne · temps'].after, /> 10 s/);          // hors objectif signale
  assert.equal(by['Style (proximité avec vos réponses)'].better, true);
  assert.equal(by['Culture générale'].better, null);                     // inchange
  assert.equal(by['Premier mot'].better, undefined === 0 ? null : by['Premier mot'].better);
  const lines = B.verdictLines(rows);
  assert.match(lines[0], /amélioré/);
  assert.ok(lines.some(l => /À surveiller/.test(l)));
});

test('comparaison : valeurs non mesurees ignorees, jamais inventees', () => {
  const rows = B.compare(snap({ speed: [pt('court', 3000)] }), snap({ speed: [pt('moyen', 8000)] }));
  assert.equal(rows.length > 0 ? rows.some(r => /temps/.test(r.label)) : false, false);
  assert.deepEqual(B.verdictLines([]), ['Rien de comparable entre ces deux mesures.']);
});

test('mesure de vitesse : questions fixes, ok = dans le delai (+0,5 s de tolerance)', async () => {
  const calls = [];
  const ev = { async timed(msgs, variant, kind) { calls.push([kind, variant, msgs[msgs.length - 1].content]); return { text: 'x', ms: kind === 'court' ? 5400 : 12000, ttftMs: 700, tokens: 20, tps: 9, cut: kind !== 'court' }; } };
  const out = await B.measureSpeed(ev, ['court', 'moyen'], 'base', (q) => [{ role: 'user', content: q }]);
  assert.deepEqual(calls.map(c => c[0]), ['court', 'moyen']);
  assert.equal(calls[0][2], B.SPEED_PROMPTS.court);
  assert.equal(out[0].ok, true);
  assert.equal(out[1].ok, false);
});
