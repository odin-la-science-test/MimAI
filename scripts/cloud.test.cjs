// IA en ligne gratuite : suivi des limites, bascule automatique, flux SSE, découverte des modèles. Lancer : npm run test:cloud
// Aucun réseau : de FAUX fournisseurs sont injectés dans le cœur (core.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./_ts-loader.cjs');
const P = load('src/services/cloud/providers.ts');
const Q = load('src/services/cloud/quota.ts');
const S = load('src/services/cloud/sse.ts');
const R = load('src/services/cloud/router.ts');
const C = load('src/services/cloud/core.ts');

/* ───────── fournisseurs et modèles ───────── */
test('fournisseurs : les 7 du tableau, limites conformes, adresses https', () => {
  assert.deepEqual(P.PROVIDERS.map(p => p.id).sort(), ['cerebras', 'cloudflare', 'gemini', 'groq', 'mistral', 'openrouter', 'sambanova']);
  const by = P.PROVIDER_BY_ID;
  assert.equal(by.cerebras.dailyTokens, 1_000_000); assert.equal(by.cerebras.scope, 'provider');
  assert.equal(by.groq.dailyTokens, 200_000); assert.equal(by.groq.scope, 'model');
  assert.equal(by.sambanova.dailyTokens, 200_000); assert.equal(by.sambanova.scope, 'model');
  assert.equal(by.cloudflare.dailyNeurons, 10_000);
  for (const p of P.PROVIDERS) { assert.ok(p.base.startsWith('https://'), p.id); assert.ok(p.keyUrl.startsWith('https://'), p.id); assert.ok(p.privacy.length > 20, p.id); }
  assert.equal(P.apiBase(by.cloudflare, 'abc123'), 'https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1');
});

test('détection du fournisseur d\'une clé collée', () => {
  assert.equal(P.detectProvider('gsk_' + 'a'.repeat(40)), 'groq');
  assert.equal(P.detectProvider('csk-' + 'b'.repeat(30)), 'cerebras');
  assert.equal(P.detectProvider('AIza' + 'c'.repeat(35)), 'gemini');
  assert.equal(P.detectProvider('sk-or-v1-' + 'd'.repeat(40)), 'openrouter');
  assert.equal(P.detectProvider('n importe quoi'), null);
});

test('modèles : seuls les modèles de discussion gratuits, classés par niveau', () => {
  const raw = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'whisper-large-v3', 'meta-llama/llama-guard-4-12b', 'openai/gpt-oss-120b', 'playai-tts', 'qwen/qwen3-32b'].map(id => ({ id }));
  const m = P.pickModels('groq', raw);
  const ids = m.map(x => x.id);
  assert.ok(!ids.some(i => /whisper|tts|guard/.test(i)));
  assert.ok(ids.includes('llama-3.3-70b-versatile') && ids.includes('llama-3.1-8b-instant'));
  assert.equal(m.find(x => x.id === 'llama-3.1-8b-instant').tier, 'fast');
  assert.equal(m.find(x => x.id === 'llama-3.3-70b-versatile').tier, 'strong');
  // OpenRouter : seuls les « :free » ou à prix nul
  const or = P.pickModels('openrouter', [{ id: 'a/b:free' }, { id: 'c/d', pricing: { prompt: '0.001', completion: '0.002' } }, { id: 'e/f', pricing: { prompt: '0', completion: '0' } }]);
  assert.deepEqual(or.map(x => x.id).sort(), ['a/b:free', 'e/f']);
  // Gemini : préfixe « models/ » retiré, images prises en charge
  const g = P.pickModels('gemini', [{ id: 'models/gemini-2.5-flash' }, { id: 'models/text-embedding-004' }], 'models/');
  assert.deepEqual(g.map(x => x.id), ['gemini-2.5-flash']);
  assert.equal(g[0].vision, true);
});

/* ───────── jours, fuseaux, limites ───────── */
test('jour de remise à zéro : UTC et heure du Pacifique (heure d\'été comprise)', () => {
  const t = Date.UTC(2026, 9, 15, 3, 30);              // 15 oct. 2026, 03:30 UTC = 14 oct., 20:30 PDT
  assert.equal(Q.dayKey(t, 'UTC'), '2026-10-15');
  assert.equal(Q.dayKey(t, 'America/Los_Angeles'), '2026-10-14');
  const w = Date.UTC(2026, 0, 15, 7, 30);              // 15 janv., 07:30 UTC = 14 janv., 23:30 PST
  assert.equal(Q.dayKey(w, 'America/Los_Angeles'), '2026-01-14');
  assert.equal(new Date(Q.nextResetMs(t, 'UTC')).toISOString(), '2026-10-16T00:00:00.000Z');
  assert.equal(new Date(Q.nextResetMs(t, 'America/Los_Angeles')).toISOString(), '2026-10-15T07:00:00.000Z');   // minuit PDT
  assert.equal(new Date(Q.nextResetMs(w, 'America/Los_Angeles')).toISOString(), '2026-01-15T08:00:00.000Z');   // minuit PST
});

test('compteurs : remis à zéro chaque jour ; une clé refusée reste refusée', () => {
  const def = P.PROVIDER_BY_ID.groq;
  const t1 = Date.UTC(2026, 9, 15, 10);
  let e = Q.roll(undefined, t1, 'UTC');
  e = Q.recordUsage(def, e, 'm', 500, 300);
  assert.equal(e.tokens, 800); assert.equal(e.requests, 1);
  const next = Q.roll(e, t1 + 86_400_000, 'UTC');
  assert.equal(next.tokens, 0);
  const bad = { ...e, blockKind: 'auth', blockedUntil: Number.MAX_SAFE_INTEGER, blockReason: 'x' };
  assert.equal(Q.roll(bad, t1 + 86_400_000, 'UTC').blockKind, 'auth');
});

test('limite du jour : bloque avant d\'atteindre le seuil (3 % de marge), par modèle pour Groq', () => {
  const def = P.PROVIDER_BY_ID.groq;
  const now = Date.UTC(2026, 9, 15, 10);
  let me = Q.recordUsage(def, Q.emptyEntry('2026-10-15'), 'm', 150_000, 40_000);   // 190 000 / 200 000
  assert.equal(Q.canUse(def, [Q.emptyEntry('2026-10-15'), me], now, 1000).ok, true);
  assert.equal(Q.canUse(def, [Q.emptyEntry('2026-10-15'), me], now, 8000).ok, false);   // 198 000 > 194 000
  assert.equal(Q.canUse(def, [Q.emptyEntry('2026-10-15'), Q.emptyEntry('2026-10-15')], now, 8000).ok, true, 'un autre modèle a encore tout son quota');
  assert.ok(Math.abs(Q.remainingFraction(def, me) - 0.05) < 1e-9);
  assert.equal(Q.remainingFraction(P.PROVIDER_BY_ID.mistral, me), 1, 'limite inconnue = pas de limite locale');
});

test('Cloudflare : suivi en neurones estimés', () => {
  const def = P.PROVIDER_BY_ID.cloudflare;
  const small = Q.neuronsFor('@cf/meta/llama-3.1-8b-instruct', 1000, 1000);
  const big = Q.neuronsFor('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 1000, 1000);
  assert.ok(big > small * 2);
  let e = Q.recordUsage(def, Q.emptyEntry('d'), '@cf/meta/llama-3.1-8b-instruct', 1000, 1000);
  assert.ok(Math.abs(e.neurons - small) < 1e-9);
  assert.equal(Q.limitOf(def), 10_000);
});

/* ───────── en-têtes et erreurs ───────── */
test('durées des en-têtes de limite', () => {
  assert.equal(Q.parseDuration('1m30.5s'), 90500);
  assert.equal(Q.parseDuration('2.5s'), 2500);
  assert.equal(Q.parseDuration('6h12m'), 22_320_000);
  assert.equal(Q.parseDuration('120'), 120_000);
  assert.equal(Q.parseDuration('45ms'), 45);
  assert.equal(Q.parseDuration('n/a'), null);
});

test('en-têtes x-ratelimit : on garde le plus bas des restes et le plus long délai', () => {
  const h = Q.parseRateHeaders({ 'x-ratelimit-remaining-tokens': '5000', 'x-ratelimit-remaining-requests': '12', 'x-ratelimit-reset-tokens': '7.66s', 'x-ratelimit-reset-requests': '2m59s', 'retry-after': '30' });
  assert.equal(h.remTokens, 5000); assert.equal(h.remRequests, 12);
  assert.equal(h.resetMs, 179_000);
  const c = Q.parseRateHeaders({ 'X-RateLimit-Remaining-Tokens-Minute': '900', 'X-RateLimit-Remaining-Requests-Day': '0' });
  assert.equal(c.remTokens, 900); assert.equal(c.remRequests, 0);
});

test('classement des erreurs : clé, limite du jour, limite momentanée, modèle disparu, panne', () => {
  assert.equal(Q.classifyFailure(401, 'Invalid API Key').kind, 'auth');
  assert.equal(Q.classifyFailure(400, 'API key not valid. Please pass a valid API key.').kind, 'auth');
  assert.equal(Q.classifyFailure(429, 'Rate limit reached for model in organization on tokens per day (TPD): Limit 200000').kind, 'quota');
  const r = Q.classifyFailure(429, 'Rate limit reached on tokens per minute', { 'retry-after': '12' });
  assert.equal(r.kind, 'rate'); assert.equal(r.retryMs, 12_000);
  assert.equal(Q.classifyFailure(429, 'slow down', { 'retry-after': '7200' }).kind, 'quota', 'plus de 15 min d\'attente = limite du jour');
  assert.equal(Q.classifyFailure(404, 'The model `x` does not exist').kind, 'model');
  assert.equal(Q.classifyFailure(400, 'bad json').kind, 'bad_request');
  assert.equal(Q.classifyFailure(503, 'overloaded').kind, 'server');
  assert.equal(Q.classifyFailure(0, 'network').kind, 'server');
});

test('blocages : se lèvent tout seuls (minuit, délai du fournisseur, reprise après panne)', () => {
  const def = P.PROVIDER_BY_ID.cerebras;
  const now = Date.UTC(2026, 9, 15, 10);
  const q = Q.applyFailure(def, Q.emptyEntry('2026-10-15'), { kind: 'quota', reason: 'x' }, now);
  assert.ok(q.blockedUntil > Date.UTC(2026, 9, 16) && q.blockedUntil < Date.UTC(2026, 9, 16, 0, 5));
  const r = Q.applyFailure(def, Q.emptyEntry('d'), { kind: 'rate', retryMs: 12_000, reason: 'x' }, now);
  assert.equal(r.blockedUntil, now + 12_000);
  let s = Q.emptyEntry('d');
  s = Q.applyFailure(def, s, { kind: 'server', reason: 'x' }, now);   // 15 s
  s = Q.applyFailure(def, s, { kind: 'server', reason: 'x' }, now);   // 30 s
  s = Q.applyFailure(def, s, { kind: 'server', reason: 'x' }, now);   // 60 s
  assert.equal(s.blockedUntil, now + 60_000);
  const ok = Q.applySuccess(def, s, {}, now + 61_000);
  assert.equal(ok.blockedUntil, 0); assert.equal(ok.fails, 0);
  const bad = Q.applyFailure(def, Q.emptyEntry('d'), { kind: 'bad_request', reason: 'x' }, now);
  assert.equal(bad.blockedUntil, 0, 'une requête mal formée n\'accuse pas le fournisseur');
  const empty = Q.applySuccess(def, Q.emptyEntry('2026-10-15'), { remRequests: 0, resetMs: 3_600_000 }, now);
  assert.equal(empty.blockKind, 'quota');
});

/* ───────── flux SSE ───────── */
test('SSE : morceaux coupés n\'importe où, fin de flux, usage', () => {
  const p = new S.SseParser();
  const got = [];
  const feed = s => p.push(s).forEach(d => got.push(d));
  feed('data: {"choices":[{"delta":{"content":"Bon"}}]}\n');
  feed('\ndata: {"choices":[{"delta":{"content":"jour"}}]}\r\n\r\ndata: {"cho');
  feed('ices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\ndata: [DONE]\n\n');
  assert.equal(got.length, 4);
  let text = '', usage = null, finish = null, done = false;
  for (const d of got) { const x = S.interpret(d); if (x === null) { done = true; continue; } if (x.text) text += x.text; if (x.usage) usage = x.usage; if (x.finish) finish = x.finish; }
  assert.equal(text, 'Bonjour'); assert.deepEqual(usage, { prompt: 10, completion: 2, total: 12 }); assert.equal(finish, 'stop'); assert.ok(done);
  assert.deepEqual(S.interpret('{"choices":[{"delta":{"content":[{"type":"text","text":"a"},{"type":"text","text":"b"}]}}]}'), { text: 'ab' });
  assert.equal(S.interpret('{"x_groq":{"usage":{"prompt_tokens":3,"completion_tokens":4}}}').usage.total, 7);
  assert.equal(S.interpret('{"error":{"message":"boom"}}').error, 'boom');
  assert.deepEqual(S.interpret('pas du json'), {});
});

/* ───────── cœur : bascule automatique ───────── */
function makeEngine({ providers, behaviour, now = Date.UTC(2026, 9, 15, 10) }) {
  const settings = C.defaultCloud();
  settings.enabled = true;
  const keys = {};
  Object.keys(providers).forEach((id, i) => { settings.providers[id] = { enabled: true, order: i, account: id === 'cloudflare' ? 'acc' : undefined, models: providers[id] }; keys[id] = 'key-' + id; });
  const clock = { t: now };
  const calls = [];
  const engine = new C.CloudEngine({
    chat: async (id, key, account, model, messages, o) => {
      calls.push(id + '/' + model);
      const b = behaviour(id, model, calls.length);
      if (b instanceof Error) throw b;
      if (b.onText) o.onText(b.text);
      return { text: b.text, tokensIn: b.tin ?? 20, tokensOut: b.tout ?? 30, finish: b.finish, headers: b.headers || {} };
    },
    listModels: async () => [], getKey: id => keys[id] || null, setKey: async (id, k) => { keys[id] = k; },
    now: () => clock.t, get: () => settings, set: fn => fn(settings),
  });
  return { engine, settings, calls, clock, keys };
}
const M = (id, tier = 'balanced', extra = {}) => ({ id, tier, vision: false, reasoning: false, free: true, ...extra });
const req = (o = {}) => ({ messages: [{ role: 'user', content: 'Bonjour' }], kind: 'court', needVision: false, maxTokens: 100, promptChars: 40, budgetMs: 20000, ...o });
const fail = (kind, extra = {}) => new R.CloudError({ kind, reason: kind, ...extra });

test('bascule silencieuse : limite du jour chez le premier → le suivant répond, sans erreur visible', async () => {
  const { engine, calls, settings } = makeEngine({
    providers: { groq: [M('g-fast', 'fast')], cerebras: [M('c-fast', 'fast')] },
    behaviour: (id) => (id === 'groq' ? fail('quota') : { text: 'Salut !' }),
  });
  const r = await engine.complete(req());
  assert.equal(r.text, 'Salut !'); assert.equal(r.providerId, 'cerebras'); assert.equal(r.tried, 2);
  assert.deepEqual(calls, ['groq/g-fast', 'cerebras/c-fast']);
  // la limite de Groq est mémorisée : la demande suivante n'essaie même plus Groq
  calls.length = 0;
  const r2 = await engine.complete(req());
  assert.equal(r2.providerId, 'cerebras'); assert.deepEqual(calls, ['cerebras/c-fast']);
  assert.ok(settings.events.some(e => /Bascule/.test(e.msg)));
});

test('Groq limite PAR MODÈLE : un autre modèle du même fournisseur prend le relais', async () => {
  const { engine, calls } = makeEngine({
    providers: { groq: [M('g-70b', 'strong'), M('g-8b', 'fast')] },
    behaviour: (id, model) => (model === 'g-70b' ? fail('quota') : { text: 'ok' }),
  });
  const r = await engine.complete(req({ kind: 'reflexion' }));
  assert.equal(r.model, 'g-8b');
  assert.deepEqual(calls, ['groq/g-70b', 'groq/g-8b']);
  calls.length = 0;
  await engine.complete(req({ kind: 'reflexion' }));
  assert.deepEqual(calls, ['groq/g-8b'], 'le modèle épuisé est écarté jusqu\'à minuit');
});

test('la limite se lève toute seule le lendemain', async () => {
  const { engine, calls, clock } = makeEngine({
    providers: { groq: [M('g-8b', 'fast')], mistral: [M('m-small', 'fast')] },
    behaviour: (id) => (id === 'groq' ? fail('quota') : { text: 'ok' }),
  });
  await engine.complete(req());
  calls.length = 0;
  await engine.complete(req());
  assert.deepEqual(calls, ['mistral/m-small']);
  clock.t += 86_400_000 + 60_000;     // le lendemain
  calls.length = 0;
  await engine.complete(req());
  assert.equal(calls[0], 'groq/g-8b', 'Groq est de nouveau essayé en premier');
});

test('clé refusée : fournisseur écarté, les autres continuent ; panne : réessayée plus tard', async () => {
  let groqCalls = 0;
  const { engine, calls, clock, settings } = makeEngine({
    providers: { groq: [M('g-8b', 'fast')], cerebras: [M('c-8b', 'fast')] },
    behaviour: (id) => (id === 'groq' ? (++groqCalls === 1 ? fail('server') : { text: 'groq ok' }) : { text: 'cerebras ok' }),
  });
  const r = await engine.complete(req());
  assert.equal(r.providerId, 'cerebras');
  clock.t += 20_000;                  // la panne de 15 s est levée
  calls.length = 0;
  const r2 = await engine.complete(req());
  assert.equal(calls[0], 'groq/g-8b'); assert.equal(r2.text, 'groq ok');
  // clé refusée
  const e2 = makeEngine({ providers: { groq: [M('g')], mistral: [M('m')] }, behaviour: (id) => (id === 'groq' ? fail('auth') : { text: 'ok' }) });
  await e2.engine.complete(req());
  assert.equal(e2.engine.summary().find(s => s.id === 'groq').status.state, 'auth');
  e2.calls.length = 0;
  await e2.engine.complete(req());
  assert.deepEqual(e2.calls, ['mistral/m']);
  void settings;
});

test('modèle disparu : écarté 24 h, sans accuser le fournisseur', async () => {
  const { engine, calls } = makeEngine({
    providers: { groq: [M('vieux', 'fast'), M('neuf', 'fast')] },
    behaviour: (id, model) => (model === 'vieux' ? fail('model') : { text: 'ok' }),
  });
  const r = await engine.complete(req());
  assert.equal(r.model, 'neuf');
  calls.length = 0;
  await engine.complete(req());
  assert.deepEqual(calls, ['groq/neuf']);
});

test('aucun fournisseur disponible → null (l\'appelant retombe sur le modèle local)', async () => {
  const e = makeEngine({ providers: { groq: [M('g')] }, behaviour: () => fail('quota') });
  assert.equal(await e.engine.complete(req()), null);
  assert.equal(await e.engine.complete(req()), null, 'rien à essayer : pas d\'appel inutile');
  assert.equal(e.calls.length, 1);
  const off = makeEngine({ providers: { groq: [M('g')] }, behaviour: () => ({ text: 'x' }) });
  off.settings.enabled = false;
  assert.equal(await off.engine.complete(req()), null);
  assert.equal(off.calls.length, 0, 'IA en ligne désactivée : rien ne sort');
});

test('choix selon la demande : rapide pour une question courte, fort pour la réflexion, vision si photo', async () => {
  const providers = { groq: [M('g-fast', 'fast'), M('g-strong', 'strong', { reasoning: true })], gemini: [M('gem', 'balanced', { vision: true })] };
  const a = makeEngine({ providers, behaviour: () => ({ text: 'ok' }) });
  assert.equal((await a.engine.complete(req({ kind: 'court' }))).model, 'g-fast');
  const b = makeEngine({ providers, behaviour: () => ({ text: 'ok' }) });
  assert.equal((await b.engine.complete(req({ kind: 'reflexion' }))).model, 'g-strong');
  const c = makeEngine({ providers, behaviour: () => ({ text: 'ok' }) });
  assert.equal((await c.engine.complete(req({ needVision: true }))).providerId, 'gemini');
  assert.equal(c.engine.available('court', true), true);
  const d = makeEngine({ providers: { groq: [M('g-fast', 'fast')] }, behaviour: () => ({ text: 'ok' }) });
  assert.equal(d.engine.available('court', true), false, 'pas de modèle de vision : le cloud ne convient pas, le local prend le relais');
});

test('les usages s\'additionnent et se répartissent : le fournisseur le moins entamé passe devant', async () => {
  const { engine, settings } = makeEngine({
    providers: { groq: [M('g', 'fast')], sambanova: [M('s', 'fast')] },
    behaviour: () => ({ text: 'ok', tin: 100, tout: 100 }),
  });
  // Groq a déjà consommé 150 000 jetons aujourd'hui sur 200 000
  settings.quota['groq|g'] = { ...Q.emptyEntry('2026-10-15'), tokens: 150_000 };
  const r = await engine.complete(req());
  assert.equal(r.providerId, 'sambanova', 'à qualité égale, celui qui a le plus de quota restant');
  const s = engine.summary().find(x => x.id === 'sambanova');
  assert.equal(s.usedToday, 200); assert.equal(s.requests, 1); assert.equal(s.limit, 200_000);
});

test('les en-têtes du fournisseur font foi : « 0 requête restante » bloque jusqu\'à la remise à zéro', async () => {
  const { engine, calls } = makeEngine({
    providers: { cerebras: [M('c', 'fast')], mistral: [M('m', 'fast')] },
    behaviour: (id) => (id === 'cerebras' ? { text: 'dernier', headers: { 'x-ratelimit-remaining-requests-day': '0', 'x-ratelimit-reset-requests-day': '3h' } } : { text: 'relais' }),
  });
  assert.equal((await engine.complete(req())).text, 'dernier');
  calls.length = 0;
  assert.equal((await engine.complete(req())).text, 'relais');
  assert.deepEqual(calls, ['mistral/m']);
});

test('le texte arrive en direct (flux) et la coupure par longueur est signalée', async () => {
  const seen = [];
  const { engine } = makeEngine({ providers: { groq: [M('g')] }, behaviour: () => ({ text: 'Réponse tronquée', finish: 'length', onText: true }) });
  const r = await engine.complete(req({ onText: t => seen.push(t) }));
  assert.equal(r.cut, true); assert.deepEqual(seen, ['Réponse tronquée']);
});

/* ───────── connexion d'une clé ───────── */
test('connexion : clé valide → modèles découverts et fournisseur activé ; clé fausse → message clair, rien d\'enregistré', async () => {
  const settings = C.defaultCloud(); settings.enabled = true;
  const keys = {};
  const mk = (list) => new C.CloudEngine({
    chat: async () => ({ text: 'ok', tokensIn: 1, tokensOut: 1, headers: {} }),
    listModels: async (id, key) => { if (key === 'mauvaise') throw fail('auth'); return list; },
    getKey: id => keys[id] || null, setKey: async (id, k) => { keys[id] = k; }, now: () => 1, get: () => settings, set: fn => fn(settings),
  });
  const e = mk([{ id: 'llama-3.3-70b-versatile' }, { id: 'llama-3.1-8b-instant' }, { id: 'whisper-large-v3' }]);
  const ko = await e.connect('groq', 'mauvaise');
  assert.equal(ko.ok, false); assert.match(ko.error, /refusée/);
  assert.equal(keys.groq, undefined); assert.equal(settings.providers.groq, undefined);
  const ok = await e.connect('groq', ' gsk_bonne ');
  assert.equal(ok.ok, true); assert.equal(ok.models, 2);
  assert.equal(keys.groq, 'gsk_bonne'); assert.equal(settings.providers.groq.enabled, true);
  assert.match((await e.connect('cloudflare', 'tok', '')).error, /identifiant de compte/);
  assert.match((await e.connect('groq', '')).error, /Collez/);
  const none = await mk([{ id: 'whisper-large-v3' }]).connect('mistral', 'k');
  assert.equal(none.ok, false); assert.match(none.error, /aucun modèle gratuit/);
  await e.disconnect('groq');
  assert.equal(keys.groq, null); assert.equal(settings.providers.groq, undefined);
});

test('Cloudflare : liste de modèles fournie par l\'app, validation par une toute petite requête', async () => {
  const settings = C.defaultCloud(); settings.enabled = true;
  const keys = {}; let probe = null;
  const e = new C.CloudEngine({
    chat: async (id, key, account, model, messages, o) => { probe = { id, account, model, max: o.maxTokens }; return { text: 'ok', tokensIn: 1, tokensOut: 1, headers: {} }; },
    listModels: async () => { throw new Error('ne doit pas être appelé'); },
    getKey: id => keys[id] || null, setKey: async (id, k) => { keys[id] = k; }, now: () => 1, get: () => settings, set: fn => fn(settings),
  });
  const r = await e.connect('cloudflare', 'tok', 'compte42');
  assert.equal(r.ok, true);
  assert.deepEqual(probe, { id: 'cloudflare', account: 'compte42', model: '@cf/meta/llama-3.1-8b-instruct', max: 1 });
  assert.equal(settings.providers.cloudflare.account, 'compte42');
});

test('remise à jour quotidienne de la liste des modèles (une fois par jour, remplace les modèles disparus)', async () => {
  const settings = C.defaultCloud(); settings.enabled = true;
  let t = Date.UTC(2026, 9, 15), listed = 0;
  settings.providers.groq = { enabled: true, order: 0, models: [M('ancien')], refreshedAt: t - 3_600_000 };
  const e = new C.CloudEngine({
    chat: async () => ({ text: 'ok', tokensIn: 1, tokensOut: 1, headers: {} }),
    listModels: async () => { listed++; return [{ id: 'llama-3.1-8b-instant' }, { id: 'llama-3.3-70b-versatile' }]; },
    getKey: () => 'k', setKey: async () => {}, now: () => t, get: () => settings, set: fn => fn(settings),
  });
  await e.refreshModels(); assert.equal(listed, 0, 'trop tôt');
  t += 25 * 3_600_000;
  await e.refreshModels(); assert.equal(listed, 1);
  assert.deepEqual(settings.providers.groq.models.map(m => m.id).sort(), ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']);
});

/* ───────── images, voix, demandes de création ───────── */
const MD = load('src/services/cloud/media.ts');
const okPost = (obj, status = 200) => async () => ({ status, headers: {}, text: JSON.stringify(obj) });

test('demandes de création : image, vocal, vidéo ; les questions ordinaires passent', () => {
  assert.deepEqual(MD.detectIntent('Génère une image d\'un chat sur la lune'), { kind: 'image', prompt: 'chat sur la lune' });
  assert.equal(MD.detectIntent('dessine une image de montagnes').kind, 'image');
  assert.equal(MD.detectIntent('crée une vidéo d\'une vague').kind, 'video');
  const v = MD.detectIntent('fais un vocal : « Bonjour tout le monde »');
  assert.equal(v.kind, 'voice'); assert.equal(v.prompt, 'Bonjour tout le monde');
  assert.equal(MD.detectIntent('Quelle est la capitale de la France ?'), null);
  assert.equal(MD.detectIntent('explique-moi comment générer une image avec python'), null);
  assert.equal(MD.detectIntent('génère une image'), null);
});

test('WAV : en-tête correct autour du son brut', () => {
  const pcm = Buffer.from([1, 0, 2, 0, 3, 0]).toString('base64');
  const wav = Buffer.from(MD.pcmToWavBase64(pcm, 24000), 'base64');
  assert.equal(wav.slice(0, 4).toString(), 'RIFF'); assert.equal(wav.slice(8, 12).toString(), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 24000); assert.equal(wav.readUInt32LE(40), 6); assert.equal(wav.length, 50);
});

test('images et voix : réponses de Cloudflare et de Gemini lues correctement', async () => {
  const cf = await MD.genImage('cloudflare', 'k', 'acc', 'chat', okPost({ result: { image: 'QUJD' }, success: true }));
  assert.deepEqual(cf, { base64: 'QUJD', mime: 'image/jpeg' });
  const gm = await MD.genImage('gemini', 'k', undefined, 'chat', okPost({ candidates: [{ content: { parts: [{ text: 'ok' }, { inlineData: { mimeType: 'image/png', data: 'REVG' } }] } }] }));
  assert.deepEqual(gm, { base64: 'REVG', mime: 'image/png' });
  const sp = await MD.genSpeech('cloudflare', 'k', 'acc', 'bonjour', 'FR', okPost({ result: { audio: 'AAA' } }));
  assert.equal(sp.mime, 'audio/mpeg');
  const g2 = await MD.genSpeech('gemini', 'k', undefined, 'bonjour', 'Kore', okPost({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: Buffer.from([0, 0]).toString('base64') } }] } }] }));
  assert.equal(g2.mime, 'audio/wav');
  await assert.rejects(MD.genImage('gemini', 'k', undefined, 'x', okPost({ candidates: [{ content: { parts: [{ text: 'refus' }] } }] })), e => e.failure.kind === 'model');
  await assert.rejects(MD.genImage('cloudflare', 'bad', 'acc', 'x', okPost({ errors: [{ message: 'Authentication error' }] }, 401)), e => e.failure.kind === 'auth');
});

test('création : bascule vers le fournisseur suivant, limites comptées, rien si non connecté', async () => {
  const { engine, settings } = makeEngine({ providers: { cloudflare: [M('x')], gemini: [M('g')] }, behaviour: () => ({ text: '' }) });
  const posts = [];
  engine.d.post = async (url) => {
    posts.push(url);
    if (url.includes('cloudflare')) return { status: 429, headers: {}, text: 'daily neurons quota exceeded' };
    return { status: 200, headers: {}, text: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'REVG' } }] } }] }) };
  };
  assert.equal(engine.mediaAvailable('image'), true);
  const r = await engine.media('image', (id, key, account, post) => MD.genImage(id, key, account, 'chat', post));
  assert.equal(r.providerId, 'gemini'); assert.equal(r.tried, 2); assert.equal(posts.length, 2);
  assert.ok(settings.quota['gemini|*'].requests >= 1);
  const again = await engine.media('image', (id, key, account, post) => MD.genImage(id, key, account, 'chat', post));
  assert.equal(again.providerId, 'gemini');
  assert.equal(posts.filter(u => u.includes('cloudflare')).length, 1, 'Cloudflare est mis de côté après sa limite');
  const none = makeEngine({ providers: { groq: [M('g')] }, behaviour: () => ({ text: '' }) });
  none.engine.d.post = async () => { throw new Error('ne doit pas être appelé'); };
  assert.equal(none.engine.mediaAvailable('image'), false);
  assert.equal(await none.engine.media('image', () => { throw new Error('non'); }), null);
  assert.deepEqual(MD.videoProviders(), []);
});
