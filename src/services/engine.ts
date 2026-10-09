/* MiMai — moteur d'inférence local (README §3, §5).
   Deux implémentations derrière la même interface :
   1. llama.rn : vrai modèle GGUF exécuté sur l'appareil (si installé) ;
   2. moteur intégré : génération déterministe hors ligne, alimentée par la
      mémoire, le RAG et les exemples de style — l'app reste 100 % fonctionnelle
      sans poids (les modèles sont des composants séparés, ADR-004).
   Aucun des deux n'accède au réseau. */
import type { AppData, Doc, Memory, Msg, TEx } from './db';
import { RAG, summarize } from './rag';
import { memoryLines, looksLikePreference } from './memory';
import { MODELS, modelFilePath } from './net';
import * as FileSystem from 'expo-file-system/legacy';
import { selectFewShots, parseMeta, visibleRules, registerEvaluatorFactory, EXPORT_SYSTEM, datasetFrom, splitPairs, profileMessages, scoreVariant, snapshotFrom, activeAdapter } from './training';
import { measureSpeed, type BenchSnapshot } from './bench';
import type { TrainPair, ChatMsg, Evaluator, AdapterRef } from './training';
import { classify, maxTokensFor, lengthHint, trimToSentence, historyWindow, fewShotCount, BUDGET_MS } from './speedplan';
import type { Kind } from './speedplan';

export interface GenerateCtx {
  history: Msg[];
  userText: string;
  mode: 'rapide' | 'reflexion' | 'vision' | 'outils';
  docs: Doc[];
  memories: Memory[];
  adapterRules: string[];
  examples: TEx[];
  modelName: string;
  forcedDoc?: Doc | null;
  /* texte de la réponse au fur et à mesure de sa production (affichage en direct) */
  onText?: (text: string) => void;
}

export type Step = string;

export function planSteps(ctx: GenerateCtx): Step[] {
  const steps: Step[] = ['Analyse'];
  const docHit = ctx.forcedDoc || RAG.findDocByName(ctx.userText, ctx.docs);
  steps.push(docHit ? 'Recherche dans la bibliothèque' : 'Recherche dans la mémoire');
  if (ctx.mode === 'reflexion' || ctx.mode === 'outils') steps.push('Utilisation d\u2019un outil');
  steps.push('Génération');
  return steps;
}

/* ─────────── llama.rn : vrai modèle GGUF (+ adaptateur LoRA) ─────────── */
interface LlamaCtx {
  completion(p: Record<string, unknown>, cb?: (d: { token?: string }) => void): Promise<{ text?: string; timings?: { predicted_per_second?: number; predicted_n?: number; prompt_per_second?: number } }>;
  stopCompletion(): Promise<void>;
  getFormattedChat(messages: unknown[], template?: string, params?: Record<string, unknown>): Promise<unknown>;
  applyLoraAdapters(l: { path: string; scaled?: number }[]): Promise<void>;
  removeLoraAdapters(): Promise<void>;
  release(): Promise<void>;
}
let llama: { file: string; ctx: LlamaCtx; adapterKey: string } | null = null;
let chain: Promise<unknown> = Promise.resolve();
/* un seul accès natif à la fois (chat et benchmark partagent le contexte) */
const exclusive = <T,>(fn: () => Promise<T>): Promise<T> => { const r = chain.then(fn, fn); chain = r.catch(() => undefined); return r; };

export class LoraLoadError extends Error {}

function llamaModule(): { initLlama: (p: Record<string, unknown>) => Promise<LlamaCtx> } | null {
  try {
    /* module natif : absent en Expo Go → repli sur le moteur intégré */
    const mod = require('llama.rn');
    return mod?.initLlama ? mod : null;
  } catch { return null; }
}
let compatMode = false;
/* change le mode ; le modèle est rechargé à la prochaine question */
export function setCompat(on: boolean): void { if (compatMode !== on) { compatMode = on; void releaseLlama(); } }
export const llamaAvailable = (): boolean => llamaModule() !== null;

async function getCtx(modelFile: string): Promise<LlamaCtx | null> {
  const mod = llamaModule();
  if (!mod || !modelFile) return null;
  if (llama && llama.file === modelFile) return llama.ctx;
  const info = await FileSystem.getInfoAsync(modelFile);
  if (!info.exists) return null; /* poids non installés : moteur intégré */
  if (llama) { try { await llama.ctx.release(); } catch { /* déjà libéré */ } llama = null; }
  /* 4 threads : sur un téléphone (gros cœurs + petits cœurs), utiliser TOUS les cœurs est en général plus lent que
     les ~4 gros cœurs. Pas de GPU sur Android avec ce moteur : tout se calcule sur le processeur. */
  /* mode compatibilité : sans réarrangement des poids en mémoire (no_extra_bufts) et sur moins de cœurs ; plus lent mais le plus sûr */
  const ctx = await mod.initLlama(compatMode
    ? { model: modelFile, n_ctx: 2048, n_gpu_layers: 0, n_threads: 2, no_extra_bufts: true, use_mlock: false }
    : { model: modelFile, n_ctx: 2048, n_gpu_layers: 0, n_threads: 4 });
  llama = { file: modelFile, ctx, adapterKey: '' };
  return ctx;
}

/* aligne l'adaptateur LoRA chargé sur celui demandé (null = modèle de base seul) */
async function syncAdapter(ctx: LlamaCtx, want: AdapterRef | null): Promise<void> {
  if (!llama) return;
  const key = want ? want.path + '@' + want.scale : '';
  if (llama.adapterKey === key) return;
  if (want) {
    try { await ctx.applyLoraAdapters([{ path: want.path, scaled: want.scale }]); }
    catch (e) { llama.adapterKey = ''; throw new LoraLoadError(String((e as Error)?.message || e)); }
  } else {
    await ctx.removeLoraAdapters();
  }
  llama.adapterKey = key;
}

export interface LlmOpts {
  adapter?: AdapterRef | null; maxTokens?: number; temperature?: number; thinking?: boolean;
  /* délai total en ms depuis l'appel : à l'échéance la génération est arrêtée et le texte déjà produit est gardé */
  deadlineMs?: number;
  /* texte produit jusqu'ici, appelé à chaque jeton (affichage en direct) */
  onText?: (text: string) => void;
}
export interface LlmResult { text: string; cut: boolean; ms: number; ttftMs: number | null; tokens: number; tps: number | null; promptTps: number | null }

/* vitesse MESURÉE par le moteur lors de la dernière génération (jetons par seconde) ; jamais estimée */
let lastTps: { gen: number; prompt: number; tokens: number } | null = null;
export const lastSpeed = () => lastTps;
/* vitesse mesurée par modèle : sert à choisir la longueur de réponse qui tient dans le délai */
const knownSpeed: Record<string, number> = {};
export const seedSpeed = (m: Record<string, number> | undefined) => { Object.keys(m || {}).forEach(k => { if ((m as Record<string, number>)[k] > 0) knownSpeed[k] = (m as Record<string, number>)[k]; }); };
export const speedOf = (modelId: string): number | null => knownSpeed[modelId] ?? null;

/* génération réelle ; renvoie null si llama.rn ou les poids sont absents */
export function llmCompleteDetailed(modelFile: string, messages: ChatMsg[], o: LlmOpts = {}): Promise<LlmResult | null> {
  const t0 = Date.now();
  return exclusive(async () => {
    const ctx = await getCtx(modelFile);
    if (!ctx) return null;
    await syncAdapter(ctx, o.adapter ?? null);
    const t1 = Date.now();
    let acc = '', ttft: number | null = null, cut = false;
    /* arrêt par délai : au moins 2,5 s de génération même si le chargement du modèle a pris du temps */
    const timer = o.deadlineMs ? setTimeout(() => { cut = true; void ctx.stopCompletion().catch(() => undefined); }, Math.max(2500, o.deadlineMs - (t1 - t0))) : null;
    try {
      /* enable_thinking:false = pas de « réflexion » invisible avant la réponse (les modèles Qwen 3 hybrides réfléchissent
         par défaut, ce qui multiplie le temps de réponse et ne peut pas être borné par un délai) ; la réflexion visible
         est demandée dans la consigne du mode Réflexion. */
      /* On applique le gabarit de discussion NOUS-MÊMES puis on envoie un prompt texte (format « contenu seul »).
         Avec `messages` + un rappel par jeton, llama.rn ré-analyse TOUT le texte généré à chaque jeton (expressions
         régulières de l'analyseur de discussion) : sur les réponses un peu longues cela fait planter l'application. */
      let prompt = '';
      let stop: string[] = [];
      try {
        const f = await ctx.getFormattedChat(messages, undefined, { jinja: true, enable_thinking: !!o.thinking }) as { prompt?: string; additional_stops?: string[] };
        prompt = String(f?.prompt || '');
        stop = Array.isArray(f?.additional_stops) ? f.additional_stops : [];
      } catch { prompt = ''; }
      const sampling = { n_predict: o.maxTokens ?? 400, temperature: o.temperature ?? 0.7, top_k: 40, top_p: 0.9 };
      const res = prompt
        ? await ctx.completion({ prompt, stop, ...sampling }, d => { if (ttft === null) ttft = Date.now() - t0; acc += d?.token || ''; o.onText?.(acc); })
        /* gabarit indisponible : génération sans flux (pas de rappel par jeton), plus lente à afficher mais sûre */
        : await ctx.completion({ messages, ...sampling, enable_thinking: !!o.thinking });
      const t = res?.timings;
      lastTps = t && t.predicted_per_second && t.predicted_per_second > 0 ? { gen: t.predicted_per_second, prompt: t.prompt_per_second || 0, tokens: t.predicted_n || 0 } : null;
      return { text: res?.text || acc, cut, ms: Date.now() - t0, ttftMs: ttft, tokens: t?.predicted_n || 0, tps: lastTps?.gen ?? null, promptTps: lastTps?.prompt || null };
    } finally { if (timer) clearTimeout(timer); }
  });
}
export async function llmComplete(modelFile: string, messages: ChatMsg[], o: LlmOpts = {}): Promise<string | null> {
  const r = await llmCompleteDetailed(modelFile, messages, o);
  return r ? r.text : null;
}

/* chauffe le moteur AVANT la première question : charge le modèle en mémoire et traite le prompt système une fois,
   pour que la vraie question n'ait plus à le faire (le début identique du prompt est réutilisé par le moteur). */
let warmKey = '';
export async function prewarm(modelId: string, ctx: Pick<GenerateCtx, 'memories' | 'adapterRules' | 'docs'>): Promise<void> {
  try {
    if (!llamaAvailable() || !MODELS[modelId]) return;
    const file = modelFilePath(modelId);
    const sys = buildSystemPrompt({ history: [], userText: '', mode: 'rapide', docs: ctx.docs, memories: ctx.memories, adapterRules: ctx.adapterRules, examples: [], modelName: modelId });
    const key = file + '|' + hash(sys);
    if (warmKey === key) return;
    const r = await llmCompleteDetailed(file, [{ role: 'system', content: sys }, { role: 'user', content: 'Bonjour' }], { maxTokens: 1, temperature: 0, deadlineMs: 15000 });
    if (r) warmKey = key;
  } catch { /* le préchauffage est facultatif */ }
}

export async function releaseLlama(): Promise<void> {
  if (llama) { try { await llama.ctx.release(); } catch { /* ignore */ } llama = null; }
}

/* évaluateur pour le benchmark local (training.ts) : A/B sur le même contexte.
   variant 'base' = sans adaptateur ; 'cand' = avec adaptateur (si fourni). Déterministe (t = 0). */
export async function makeEvaluator(modelId: string, adapter: AdapterRef | null): Promise<Evaluator | null> {
  if (!llamaAvailable() || !MODELS[modelId]) return null;
  const file = modelFilePath(modelId);
  const info = await FileSystem.getInfoAsync(file).catch(() => ({ exists: false }));
  if (!info.exists) return null;
  return {
    async generate(messages, variant, maxTokens) {
      const t = await llmComplete(file, messages, { adapter: variant === 'cand' ? adapter : null, maxTokens, temperature: 0 });
      if (t === null) throw new Error('moteur indisponible');
      return clean(t);
    },
    /* mesure chronométrée dans les MÊMES conditions que le chat (longueur et délai de la catégorie) */
    async timed(messages, variant, kind) {
      const r = await llmCompleteDetailed(file, messages, { adapter: variant === 'cand' ? adapter : null, maxTokens: maxTokensFor(kind, speedOf(modelId)), temperature: 0, deadlineMs: BUDGET_MS[kind] });
      if (!r) throw new Error('moteur indisponible');
      if (r.tps) knownSpeed[modelId] = Math.round(r.tps * 10) / 10;
      return { text: clean(r.text), ms: r.ms, ttftMs: r.ttftMs, tokens: r.tokens, tps: r.tps, cut: r.cut };
    },
  };
}
registerEvaluatorFactory(makeEvaluator);

/* Instantané de benchmark pris à la main, avec la configuration ACTIVE (modèle + profil/adaptateur éventuel) :
   vitesse sur 3 questions fixes (court / moyen / réflexion) + qualité sur le jeu de test et les questions générales.
   Sert de point « avant » à comparer plus tard avec un point « après ». Retourne null si le moteur n'est pas disponible. */
export async function takeSnapshot(data: AppData, label: string, onTick: (pct: number) => void): Promise<BenchSnapshot | null> {
  const active = activeAdapter(data);
  const meta = active ? parseMeta(active.rules) : null;
  const ref: AdapterRef | null = meta?.kind === 'lora' && meta.file ? { path: (FileSystem.documentDirectory || '') + meta.file, scale: meta.scale ?? 1 } : null;
  const ev = await makeEvaluator(data.settings.activeModel, ref);
  if (!ev || !ev.timed) return null;
  const variant: 'base' | 'cand' = active ? 'cand' : 'base';
  const rules = active ? visibleRules(active.rules) : [];
  const ds = datasetFrom(data, { useExamples: true, useConvs: true, useDocs: false });
  const { train, holdout } = splitPairs(ds.pairs);
  const timed = { timed: ev.timed.bind(ev) };
  onTick(2);
  const speed = await measureSpeed(timed, ['court', 'moyen', 'reflexion'], variant, q => profileMessages(q, variant, variant === 'base', train, rules), (d, t) => onTick(2 + (d / t) * 40));
  const useHoldout = holdout.length >= 2 ? holdout : [];
  const scores = await scoreVariant(ev, variant, { holdout: useHoldout, messagesFor: (q, _v, g) => profileMessages(q, variant, g, train, rules), onProgress: (d, t) => onTick(42 + (d / t) * 56) });
  const snap = snapshotFrom('manuel', label, data.settings.activeModel, scores, speed);
  if (!useHoldout.length) snap.style = null;
  snap.adapterV = active ? active.v : null;
  onTick(100);
  return snap;
}

/* ─────────── moteur intégré ─────────── */
const pick = <T,>(arr: T[], seed: number): T => arr[Math.abs(seed) % arr.length];
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; };

function shortLongAnswer(ctx: GenerateCtx, seed: number): string | null {
  const style = ctx.adapterRules.join(' ').toLowerCase();
  const q = ctx.userText.toLowerCase();
  const wantsShort = /courte?s?|brièvement|simplement/.test(q) || style.includes('courtes');
  const wantsLong = /détaille|longuement|en détail/.test(q) || style.includes('détaillées');
  if (wantsShort) {
    const hit = RAG.retrieve(ctx.userText, ctx.docs, 1)[0];
    if (hit) return hit.chunk.text.split(/(?<=[.!?])\s/)[0];
    return pick([
      'En deux mots : commencez petit, testez vite, gardez tout en local.',
      'L\u2019essentiel : une question à la fois, et tout reste sur cet appareil.',
    ], seed);
  }
  void wantsLong;
  return null;
}

function docAnswer(ctx: GenerateCtx, doc: Doc): string {
  const hits = RAG.retrieve(ctx.userText, [doc], 2);
  if (!hits.length) {
    const s = summarize(doc.text, 2);
    return 'J\u2019ai parcouru «\u00A0' + doc.name + '\u00A0» sur votre appareil.\n\n' + s.join(' ');
  }
  const best = hits[0];
  const extra = hits[1] && hits[1].chunk.text !== best.chunk.text ? '\n\n' + hits[1].chunk.text : '';
  return 'J\u2019ai trouvé cette information dans votre bibliothèque.\n\n' + best.chunk.text + extra;
}

const GREET = ['Bonjour ! Comment puis-je vous aider aujourd\u2019hui ?', 'Bonjour ! Je suis à vous, entièrement en local.', 'Bonjour ! De quoi voulez-vous parler ?'];
const IDENTITY = 'Je suis MiMai, une intelligence artificielle qui fonctionne entièrement sur votre appareil.\n\nVos conversations, vos documents et votre mémoire ne quittent jamais ce téléphone : je n\u2019ai même pas la possibilité d\u2019aller sur Internet.';
const HELP = 'Je peux discuter, résumer vos documents de la bibliothèque, retenir vos préférences en mémoire, et apprendre votre style à travers des exemples.\n\nTout se passe ici, sans Internet. Citez un fichier de votre bibliothèque et je le lirai en local.';
const ACK = ['C\u2019est noté, j\u2019en tiendrai compte dans nos échanges.', 'Bien reçu — je m\u2019en souviens, c\u2019est enregistré sur cet appareil.', 'Compris. J\u2019ai ajouté cela à votre mémoire locale.'];

function exampleAnswer(ctx: GenerateCtx): string | null {
  const qv = new Set(RAG.tokens(ctx.userText));
  let best: { ex: TEx; score: number } | null = null;
  for (const ex of ctx.examples) {
    const ev = RAG.tokens(ex.q);
    if (!ev.length) continue;
    let inter = 0;
    ev.forEach(t => { if (qv.has(t)) inter++; });
    const score = inter / Math.sqrt(ev.length);
    if (score > 0.55 && (!best || score > best.score)) best = { ex, score };
  }
  if (best) return best.ex.target;
  return null;
}

function integratedAnswer(ctx: GenerateCtx, seed: number): string {
  const q = ctx.userText.trim();
  const low = q.toLowerCase();

  if (looksLikePreference(q) && /^(je|retiens|n'oublie|tutoie|vouvoie)/i.test(q)) {
    return pick(ACK, seed);
  }
  if (/^(bonjour|salut|hello|bonsoir|coucou)\b/.test(low) && q.length < 30) return pick(GREET, seed);
  if (/qui es[- ]tu|tu es qui|présente[- ]toi/.test(low)) return IDENTITY;
  if (/que peux[- ]tu|aide|comment (tu fonctionnes|marches[- ]tu)|fonctionnes[- ]tu/.test(low) && q.length < 60) return HELP;
  if (/^(merci)/.test(low)) return 'Avec plaisir ! Je reste ici, sur votre appareil.';
  if (/^(ok|d'accord|parfait|super)\b/.test(low)) return 'Parfait. Que voulez-vous faire maintenant ?';

  const doc = ctx.forcedDoc || RAG.findDocByName(q, ctx.docs);
  if (doc) return docAnswer(ctx, doc);

  const hits = RAG.retrieve(q, ctx.docs, 2);
  if (hits.length && hits[0].score > 0.18) {
    const h = hits[0];
    return 'D\u2019après «\u00A0' + h.doc.name + '\u00A0» (' + h.chunk.page + ')\u00A0:\n\n' + h.chunk.text;
  }

  const ex = exampleAnswer(ctx);
  if (ex) return ex;

  const sl = shortLongAnswer(ctx, seed);
  if (sl) return sl;

  /* réflexion générique : structure utile selon le mode */
  if (ctx.mode === 'reflexion') {
    return 'Reprenons calmement.\n\n1. Que cherchez-vous à obtenir, exactement\u00A0? Formulez-le en une phrase.\n2. Qu\u2019est-ce qui existe déjà autour de vous pour y arriver\u00A0?\n3. Quel est le plus petit pas testable cette semaine\u00A0?\n\nDites-moi où vous en êtes, et je vous aide à préciser.';
  }
  if (ctx.mode === 'outils') {
    return 'Voici une base simple, à adapter\u00A0:\n\nfunction solution(input) {\n  // 1. valider l\u2019entrée\n  // 2. transformer\n  // 3. renvoyer un résultat clair\n  return input;\n}\n\nDites-moi le cas précis (langage, entrées, résultat attendu) et je complète le code.';
  }
  if (ctx.mode === 'vision') {
    return 'L\u2019analyse d\u2019images demande un modèle compatible vision, comme Gemma 3 4B.\n\nVous pouvez l\u2019installer depuis Modèles — le téléchargement reste la seule chose qui sort de l\u2019appareil, et uniquement avec votre accord.';
  }

  /* réponse constructive par défaut : recentre sur la question */
  const mems = memoryLines(ctx.memories);
  const memNote = mems.length ? '\n\n' : '';
  void memNote;
  return 'Je peux vous aider avec cela. Pour une réponse vraiment utile, donnez-moi un peu de contexte\u00A0: de quoi s\u2019agit-il, et quel résultat attendez-vous\u00A0?\n\nEt si la réponse existe dans vos documents, citez le fichier — je le lirai en local.';
}

/* ─────────── API du moteur ─────────── */
export interface GenerateInfo { tps?: number; text: string; real: boolean; adapterApplied: string | null; fewShots: number; adapterError?: string; engineError?: string; kind?: Kind; cut?: boolean; ms?: number; ttftMs?: number | null }

const toPair = (e: TEx): TrainPair => ({ id: e.id, q: e.q, a: e.target, src: 'example', weight: 2, tags: e.tags || [], ts: e.ts });

/* Niveau 1 : exemples/corrections les plus pertinents pour CETTE question (pas tout le dataset) */
export function fewShotsFor(ctx: GenerateCtx, k = 3): TrainPair[] {
  return selectFewShots(ctx.userText, ctx.examples.map(toPair), k);
}

export async function generateDetailed(ctx: GenerateCtx): Promise<GenerateInfo> {
  const meta = parseMeta(ctx.adapterRules);
  const adapter: AdapterRef | null = meta?.kind === 'lora' && meta.file
    ? { path: (FileSystem.documentDirectory || '') + meta.file, scale: meta.scale ?? 1 } : null;
  /* catégorie de la demande → longueur de réponse qui tient dans le délai (5 s / 10 s / 20 s) d'après la vitesse mesurée */
  const kind = classify(ctx.userText, ctx.mode);
  const shots = fewShotsFor(ctx, fewShotCount(kind));
  const messages = buildMessages(ctx, shots, kind);
  const maxTokens = maxTokensFor(kind, speedOf(ctx.modelName));
  let adapterError: string | undefined;
  let engineError: string | undefined;
  let real: LlmResult | null = null;
  const file = MODELS[ctx.modelName] ? modelFilePath(ctx.modelName) : '';
  const run = (ad: AdapterRef | null) => llmCompleteDetailed(file, messages, {
    adapter: ad, maxTokens, deadlineMs: BUDGET_MS[kind],
    onText: ctx.onText ? t => ctx.onText!(clean(t)) : undefined,
  });
  try {
    real = await run(adapter);
  } catch (e) {
    if (e instanceof LoraLoadError && adapter) {
      /* adaptateur illisible : on répond avec le modèle de base plutôt que d'échouer */
      adapterError = e.message;
      try { real = await run(null); } catch (e2) { real = null; engineError = e2 instanceof Error ? e2.message : String(e2); }
    } else { real = null; engineError = e instanceof Error ? e.message : String(e); }
  }
  if (real && real.text.trim()) {
    if (real.tps) knownSpeed[ctx.modelName] = Math.round(real.tps * 10) / 10;
    return { tps: real.tps ?? undefined, text: trimToSentence(clean(real.text), real.cut), real: true, adapterApplied: adapter && !adapterError ? meta!.file! : null, fewShots: shots.length, adapterError, kind, cut: real.cut, ms: real.ms, ttftMs: real.ttftMs };
  }
  const seed = hash(ctx.userText + ctx.history.length);
  const fallback = integratedAnswer(ctx, seed);
  return { text: fallback, real: false, adapterApplied: null, fewShots: 0, engineError, kind };
}

export async function generate(ctx: GenerateCtx): Promise<string> {
  return (await generateDetailed(ctx)).text;
}

function buildSystemPrompt(ctx: GenerateCtx): string {
  const rules = visibleRules(ctx.adapterRules);
  const lines: string[] = [
    EXPORT_SYSTEM,
    'Pas de markdown, pas d’emoji.' + (rules.some(r => /tutoy/i.test(r)) ? '' : ' Vouvoie l’utilisateur.'),
  ];
  const mems = memoryLines(ctx.memories);
  if (mems.length) lines.push('Mémoire locale de l’utilisateur :\n' + mems.join('\n'));
  if (rules.length) lines.push('Style personnel appris :\n' + rules.map(r => '- ' + r).join('\n'));
  const doc = ctx.forcedDoc || RAG.findDocByName(ctx.userText, ctx.docs);
  if (doc) {
    const hits = RAG.retrieve(ctx.userText, [doc], 2);
    if (hits.length) lines.push('Extraits de la bibliothèque locale (' + doc.name + ') :\n' + hits.map(h => '[' + h.chunk.page + '] ' + h.chunk.text).join('\n'));
  }
  return lines.join('\n\n');
}

/* messages de chat (gabarit du modèle appliqué par llama.rn) : système + exemples pertinents + historique + question */
function buildMessages(ctx: GenerateCtx, shots: TrainPair[], kind: Kind): ChatMsg[] {
  const out: ChatMsg[] = [{ role: 'system', content: buildSystemPrompt(ctx) }];
  shots.forEach(p => { out.push({ role: 'user', content: p.q }, { role: 'assistant', content: p.a }); });
  ctx.history.slice(-historyWindow(kind)).forEach(m => out.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  /* la consigne de longueur est collée à la question : le prompt système reste identique d'une demande à l'autre */
  out.push({ role: 'user', content: ctx.userText + '\n\n[' + lengthHint(kind) + ']' });
  return out;
}

const clean = (t: string) => String(t || '').replace(/\*\*|__/g, '').replace(/^#+\s*/gm, '').trim();

/* étiquette de vitesse affichée sous le chat */
export function speedLabel(modelId: string): string {
  const m = MODELS[modelId];
  return m ? m.params + ' · local' : 'local';
}
