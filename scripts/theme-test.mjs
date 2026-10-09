/* Tests des utilitaires purs de src/theme.ts : node --experimental-strip-types scripts/theme-test.mjs */
import assert from 'node:assert/strict';
import { fmtGo, fmtSize, titleFrom, dayOf, hhmm, nowHM, C } from '../src/theme.ts';

assert.equal(fmtGo(1.25), '1,3 Go');
assert.equal(fmtSize(500), '1 Ko');
assert.equal(fmtSize(2048), '2 Ko');
assert.equal(fmtSize(3 * 1048576), '3,0 Mo');
assert.equal(titleFrom('  bonjour   le monde '), 'Bonjour le monde');
const long = titleFrom('Une très longue question qui dépasse largement la limite de trente-quatre caractères');
assert.ok(long.endsWith('…') && long.length <= 36, long);
assert.equal(dayOf(Date.now()), 0);
assert.equal(dayOf(Date.now() - 86400000), 1);
assert.equal(dayOf(Date.now() - 5 * 86400000), 5);
assert.equal(dayOf(Date.now() + 86400000), 0);
assert.match(hhmm(Date.now()), /^\d\d:\d\d$/);
assert.match(nowHM(), /^\d\d:\d\d$/);
assert.equal(C.bg, '#f5ead8'); assert.equal(C.accent, '#c67139'); assert.equal(C.accent2, '#7a8a5e');
console.log('theme-test : OK');
