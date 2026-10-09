/* MiMai — apprentissage local (README §6-14, ADR-005/006/007).

   MODULE PUR (aucune dépendance native) : exécutable tel quel sous Node pour
   les tests (scripts/training.test.mjs). Tout ce qui touche llama.rn, au
   système de fichiers ou à la batterie vit dans engine.ts / lora.ts.

   Ce que l'app fait RÉELLEMENT (vérifié dans llama.rn 0.13.0-rc.6, voir
   docs/TRAINING.md) :
   - Niveau 1 « profil » : sélection par pertinence des meilleurs exemples /
     corrections (few-shot) + règles de style, injectés dans le prompt. Les
     poids du modèle ne changent PAS. Mesurable : benchmark avant/après sur un
     jeu de test mis de côté + garde-fou de capacités générales.
   - Niveau 2 « LoRA » : import d'un adaptateur GGUF entraîné hors de
     l'appareil (PC), vérifié (SHA-256, métadonnées, dimensions), chargé par
     llama.rn au-dessus du modèle de base, évalué puis activé ou refusé.
   - Entraînement des poids sur l'appareil : NON disponible (llama.rn
     n'expose pas llama_opt_*). Le drapeau existe mais reste faux. */
import type { AppData, TEx, Run, Adapter, Conv } from './db';
import { measureSpeed, MAX_SNAPSHOTS, type BenchSnapshot, type SpeedPoint, type TimedEvaluator } from './bench.ts';
import type { Kind } from './speedplan.ts';

export const GOAL_NAMES: Record<string, string> = { style: 'Style d’écriture', sujet: 'Mes documents', format: 'Mon format' };

/* ───────────────────────── utilitaires purs ───────────────────────── */
const nid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const STOP = new Set('le la les un une des du de d l et ou mais donc or ni car a au aux avec ce cet cette ces que qui quoi dont ou est sont etait etre avoir ai as ont pour pas ne plus tres je il elle on nous ils elles se sa son ses leur mon ma mes ton ta tes notre nos votre vos y en si dans par sur sous the of and to in is it'.split(' '));
/* mots « de contenu » : sert à la recherche d'exemples pertinents */
export function contentTokens(s: string): string[] {
  return norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 1 && !STOP.has(w));
}
/* tous les mots (style : « tu », « salut »… comptent) */
export function allWords(s: string): string[] {
  return norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
}

/* F1 sur les mots entre deux textes (0..1) — mesure de proximité de style */
export function tokenF1(pred: string, ref: string): number {
  const a = allWords(pred), b = allWords(ref);
  if (!a.length || !b.length) return 0;
  const cnt = new Map<string, number>();
  b.forEach(w => cnt.set(w, (cnt.get(w) || 0) + 1));
  let inter = 0;
  a.forEach(w => { const c = cnt.get(w) || 0; if (c > 0) { inter++; cnt.set(w, c - 1); } });
  if (!inter) return 0;
  const p = inter / a.length, r = inter / b.length;
  return (2 * p * r) / (p + r);
}

/* ───────────────────────── dataset ───────────────────────── */
export interface TrainPair {
  id: string; q: string; a: string;
  src: 'example' | 'conv';
  weight: number;          /* 1 normal, 2 = 👍 ou correction manuelle */
  tags: string[]; ts: number;
  rejected?: string;       /* mauvaise réponse connue (👎 / réponse initiale) → paires de préférence */
}
export interface DatasetOpts { useExamples: boolean; useConvs: boolean; useDocs: boolean; includeUnrated?: boolean }
export interface Dataset { pairs: TrainPair[]; examples: TEx[]; convs: Conv[]; size: number; skipped: { flagNo: number; flagMemory: number; bad: number; invalid: number; duplicate: number } }

const PLACEHOLDER = '(réponse actuelle)';
const validText = (t: string | undefined | null, min = 2, max = 4000) => { const s = (t || '').trim(); return s.length >= min && s.length <= max; };
const dedupeKey = (q: string, a: string) => norm(q).replace(/\s+/g, ' ').trim() + '\u0001' + norm(a).replace(/\s+/g, ' ').trim();

/* Politique TRAINING (§7) : seules les conversations « yes » alimentent le
   dataset ; « memory » (MEMORY_ONLY) ne sert qu'à la mémoire ; « no » est exclue.
   Les messages notés 👎 ne sont jamais des cibles positives : ils deviennent la
   réponse « rejetée » quand une réponse 👍 ultérieure répond à la même demande.
   Les documents (useDocs) ne sont PAS appris dans les poids : ils relèvent du
   RAG (mémoire ≠ entraînement, ADR-005). */
export function datasetFrom(data: AppData, opts: DatasetOpts): Dataset {
  const skipped = { flagNo: 0, flagMemory: 0, bad: 0, invalid: 0, duplicate: 0 };
  const pairs: TrainPair[] = [];
  const seen = new Set<string>();
  const push = (p: TrainPair) => {
    if (!validText(p.q) || !validText(p.a)) { skipped.invalid++; return; }
    const k = dedupeKey(p.q, p.a);
    if (seen.has(k)) { skipped.duplicate++; return; }
    seen.add(k); pairs.push(p);
  };

  const examples = opts.useExamples ? data.tex : [];
  for (const e of examples) {
    const rej = e.base && e.base !== PLACEHOLDER && norm(e.base) !== norm(e.target) ? e.base : undefined;
    push({ id: e.id, q: e.q.trim(), a: e.target.trim(), src: 'example', weight: 2, tags: e.tags || [], ts: e.ts, rejected: rej });
  }

  const usedConvs: Conv[] = [];
  if (opts.useConvs) {
    for (const c of data.convs) {
      if (c.trainFlag === 'no') { skipped.flagNo++; continue; }
      if (c.trainFlag === 'memory') { skipped.flagMemory++; continue; }
      let used = false;
      for (let i = 0; i < c.msgs.length; i++) {
        const m = c.msgs[i];
        if (m.role !== 'ai') continue;
        let j = i - 1; while (j >= 0 && c.msgs[j].role !== 'user') j--;
        if (j < 0) continue;
        const q = c.msgs[j].text;
        if (m.feedback === 'bad') {
          skipped.bad++;
          let k = i + 1; let chosen: Conv['msgs'][number] | null = null;
          for (; k < c.msgs.length; k++) if (c.msgs[k].role === 'ai' && c.msgs[k].feedback === 'good') { chosen = c.msgs[k]; break; }
          if (chosen) { push({ id: chosen.id, q, a: chosen.text.trim(), src: 'conv', weight: 2, tags: [], ts: chosen.ts, rejected: m.text.trim() }); used = true; }
          continue;
        }
        if (m.feedback !== 'good' && opts.includeUnrated === false) continue;
        push({ id: m.id, q, a: m.text.trim(), src: 'conv', weight: m.feedback === 'good' ? 2 : 1, tags: [], ts: m.ts });
        used = true;
      }
      if (used) usedConvs.push(c);
    }
  }
  void opts.useDocs;
  return { pairs, examples, convs: usedConvs, size: pairs.length, skipped };
}

/* séparation déterministe entraînement / test (même résultat sur l'app et à l'export) */
export function splitPairs(pairs: TrainPair[], ratio = 0.2, minTrain = 3): { train: TrainPair[]; holdout: TrainPair[] } {
  if (pairs.length < minTrain + 2) return { train: [...pairs], holdout: [] };
  const sorted = [...pairs].sort((x, y) => hashStr(x.id + x.q) - hashStr(y.id + y.q));
  const nHold = Math.min(pairs.length - minTrain, Math.max(DEFAULT_DECISION.minHoldout, Math.min(24, Math.round(pairs.length * ratio))));
  const holdIds = new Set(sorted.slice(0, nHold).map(p => p.id));
  return { train: pairs.filter(p => !holdIds.has(p.id)), holdout: pairs.filter(p => holdIds.has(p.id)) };
}

/* ───────────────────────── export JSONL (PC) ───────────────────────── */
export const EXPORT_SYSTEM = 'Tu es MiMai, une IA qui fonctionne entièrement sur l’appareil de l’utilisateur, sans Internet. Réponds en français, simplement et directement.';

export function toJsonl(pairs: TrainPair[], format: 'chat' | 'alpaca' | 'preference' = 'chat', system = EXPORT_SYSTEM): string {
  const lines: string[] = [];
  for (const p of pairs) {
    if (format === 'chat') lines.push(JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: p.q }, { role: 'assistant', content: p.a }] }));
    else if (format === 'alpaca') lines.push(JSON.stringify({ instruction: p.q, input: '', output: p.a }));
    else if (p.rejected) lines.push(JSON.stringify({ prompt: p.q, chosen: p.a, rejected: p.rejected }));
  }
  return lines.length ? lines.join('\n') + '\n' : '';
}

/* ───────────────────────── few-shot par pertinence (Niveau 1) ───────────────────────── */
export interface Scored { pair: TrainPair; score: number }

export function rankPairs(query: string, pairs: TrainPair[], now = Date.now()): Scored[] {
  const qt = contentTokens(query);
  if (!qt.length || !pairs.length) return [];
  const df = new Map<string, number>();
  const docs = pairs.map(p => { const t = new Set(contentTokens(p.q)); t.forEach(w => df.set(w, (df.get(w) || 0) + 1)); return t; });
  const N = pairs.length;
  const idf = (w: string) => Math.log(1 + N / (1 + (df.get(w) || 0)));
  const qset = new Set(qt);
  let qn = 0; qset.forEach(w => { qn += idf(w) ** 2; });
  const out: Scored[] = [];
  pairs.forEach((p, i) => {
    const t = docs[i]; if (!t.size) return;
    let dot = 0, dn = 0;
    t.forEach(w => { const x = idf(w); dn += x * x; if (qset.has(w)) dot += x * x; });
    if (!dot) return;
    const cos = dot / Math.sqrt(qn * dn);
    const ageDays = Math.max(0, (now - p.ts) / 86400000);
    const recency = 1 / (1 + ageDays / 90);                 /* léger avantage au récent */
    out.push({ pair: p, score: cos * (1 + 0.25 * (p.weight - 1)) * (0.9 + 0.1 * recency) });
  });
  return out.sort((a, b) => b.score - a.score || b.pair.ts - a.pair.ts);
}

export function selectFewShots(query: string, pairs: TrainPair[], k = 3, minScore = 0.18): TrainPair[] {
  const seen = new Set<string>();
  const res: TrainPair[] = [];
  for (const s of rankPairs(query, pairs)) {
    if (s.score < minScore) break;
    const key = norm(s.pair.q);
    if (seen.has(key)) continue;
    seen.add(key); res.push(s.pair);
    if (res.length >= k) break;
  }
  return res;
}

/* règles de style déduites des tags des exemples */
export function rulesFrom(examples: { tags: string[] }[], goal: string): string[] {
  const counts: Record<string, number> = {};
  examples.forEach(e => e.tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  const rules: string[] = [];
  const half = Math.max(1, examples.length / 2);
  if ((counts['court'] || 0) >= half) rules.push('Réponses courtes, messages prêts à envoyer');
  if ((counts['direct'] || 0) >= half) rules.push('Aller droit au but, sans formule de politesse lourde');
  if ((counts['tu'] || 0) >= half) rules.push('Tutoyer l’utilisateur');
  if ((counts['formel'] || 0) >= half) rules.push('Ton formel et soigné');
  if (goal === 'sujet') rules.push('S’appuyer en priorité sur les documents de la bibliothèque');
  if (goal === 'format') rules.push('Suivre la structure des exemples fournis');
  return rules;
}

/* ───────────────────────── métadonnées d'adaptateur ───────────────────────── */
/* Adapter (db.ts) n'a pas de champ libre : on sérialise la méta dans une ligne
   de `rules` préfixée par « @mimai: » (persistée par SQLite, filtrée à l'affichage). */
export interface AdapterMeta {
  kind: 'profile' | 'lora';
  evalMode: 'generative' | 'retrieval' | 'none';
  style: number | null; general: number | null;
  baseStyle: number | null; baseGeneral: number | null;
  holdout: number;
  verdict: 'pass' | 'fail' | 'inconclusive';
  reasons: string[];
  /* LoRA uniquement */
  file?: string; sha256?: string; sizeBytes?: number; baseModel?: string; scale?: number; arch?: string; rank?: number; alpha?: number;
}
export const META_PREFIX = '@mimai:';
export function packMeta(rules: string[], meta: AdapterMeta): string[] {
  return [...rules.filter(r => !r.startsWith(META_PREFIX)), META_PREFIX + JSON.stringify(meta)];
}
export function parseMeta(rules: string[] | undefined): AdapterMeta | null {
  const line = (rules || []).find(r => r.startsWith(META_PREFIX));
  if (!line) return null;
  try { return JSON.parse(line.slice(META_PREFIX.length)) as AdapterMeta; } catch { return null; }
}
export const visibleRules = (rules: string[] | undefined): string[] => (rules || []).filter(r => !r.startsWith(META_PREFIX));
export const adapterKind = (a: Adapter): 'profile' | 'lora' => parseMeta(a.rules)?.kind || 'profile';

/* ───────────────────────── versions, activation, rollback ───────────────────────── */
export const fmtVersion = (v: number) => 'v' + String(v).padStart(3, '0');
export const nextVersion = (adapters: Pick<Adapter, 'v'>[]) => adapters.reduce((m, a) => Math.max(m, a.v), 0) + 1;
export const activeAdapter = (data: AppData): Adapter | null => data.adapters.find(a => a.active) || null;

/* un seul adaptateur actif à la fois (le modèle de base reste intact) */
export function activateExclusive(adapters: Adapter[], id: string | null): void {
  adapters.forEach(a => { a.active = id !== null && a.id === id; });
}

/* Rollback (§12) : on revient à la version immédiatement inférieure à l'active.
   Rien n'est supprimé. Sans version précédente → modèle de base seul. */
export function planRollback(adapters: Pick<Adapter, 'id' | 'v' | 'active'>[]): { from: string | null; to: string | null } {
  const sorted = [...adapters].sort((a, b) => b.v - a.v);
  const active = sorted.find(a => a.active) || null;
  if (!active) return { from: null, to: sorted[0]?.id ?? null };
  const prev = sorted.find(a => a.v < active.v) || null;
  return { from: active.id, to: prev ? prev.id : null };
}
export function rollbackToPrevious(data: AppData): Adapter | null {
  const plan = planRollback(data.adapters);
  activateExclusive(data.adapters, plan.to);
  return data.adapters.find(a => a.id === plan.to) || null;
}

/* ───────────────────────── benchmark & décision ───────────────────────── */
export interface GeneralCheck { prompt: string; re: RegExp }
/* capacités générales : réponses vérifiables automatiquement (anti catastrophic forgetting, §14) */
export const GENERAL_CHECKS: GeneralCheck[] = [
  { prompt: 'Quelle est la capitale de la France ?', re: /paris/i },
  { prompt: 'Combien font 17 + 25 ?', re: /\b42\b/ },
  { prompt: 'Combien font 9 fois 8 ?', re: /\b72\b/ },
  { prompt: 'Quel est le contraire de « chaud » ?', re: /froid/i },
  { prompt: 'Combien de jours y a-t-il dans une semaine ?', re: /\b7\b|sept/i },
  { prompt: 'De quelle couleur est le ciel par temps clair ?', re: /bleu/i },
  { prompt: 'Comment dit-on « merci » en anglais ?', re: /thank/i },
  { prompt: 'Combien font 100 divisé par 4 ?', re: /\b25\b|vingt-cinq/i },
  { prompt: 'Quelle planète est la plus proche du Soleil ?', re: /mercure|mercury/i },
  { prompt: 'Combien y a-t-il de mois dans une année ?', re: /\b12\b|douze/i },
  { prompt: 'Quelle est la capitale de l’Italie ?', re: /rome/i },
  { prompt: 'Combien de côtés a un triangle ?', re: /\b3\b|trois/i },
];

/* réponse dégénérée (vide, boucle de répétition) */
export function isDegenerate(t: string): boolean {
  const w = allWords(t);
  if (w.length < 1) return true;
  if (w.length >= 12) { const u = new Set(w); if (u.size / w.length < 0.25) return true; }
  return false;
}

export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }
export type Variant = 'base' | 'cand';
export interface Evaluator { generate(messages: ChatMsg[], variant: Variant, maxTokens: number): Promise<string>; timed?: TimedEvaluator['timed'] }
export interface BenchScores { style: number; general: number; holdoutN: number; generalN: number; degenerate: number }
export interface BenchSample { q: string; target: string; base: string; cand: string }
export interface BenchReport { base: BenchScores; cand: BenchScores; samples: BenchSample[] }

export async function runBenchmark(
  ev: Evaluator,
  spec: {
    holdout: TrainPair[];
    general?: GeneralCheck[];
    messagesFor: (q: string, variant: Variant, isGeneral: boolean) => ChatMsg[];
    maxTokens?: number;
    onProgress?: (done: number, total: number) => void;
  }
): Promise<BenchReport> {
  const general = spec.general ?? GENERAL_CHECKS;
  const mt = spec.maxTokens ?? 96;
  const total = (spec.holdout.length + general.length) * 2;
  let done = 0;
  const tick = () => { done++; spec.onProgress?.(done, total); };
  const sum = { base: { f1: 0, g: 0, deg: 0 }, cand: { f1: 0, g: 0, deg: 0 } };
  const samples: BenchSample[] = [];
  for (const p of spec.holdout) {
    const out: Record<Variant, string> = { base: '', cand: '' };
    for (const v of ['base', 'cand'] as Variant[]) {
      out[v] = (await ev.generate(spec.messagesFor(p.q, v, false), v, mt)).trim();
      sum[v].f1 += tokenF1(out[v], p.a);
      if (isDegenerate(out[v])) sum[v].deg++;
      tick();
    }
    if (samples.length < 3) samples.push({ q: p.q, target: p.a, base: out.base, cand: out.cand });
  }
  for (const g of general) {
    for (const v of ['base', 'cand'] as Variant[]) {
      const t = await ev.generate(spec.messagesFor(g.prompt, v, true), v, 48);
      if (g.re.test(t) && !isDegenerate(t)) sum[v].g++;
      tick();
    }
  }
  const mk = (v: Variant): BenchScores => ({
    style: spec.holdout.length ? Math.round((sum[v].f1 / spec.holdout.length) * 1000) / 10 : 0,
    general: general.length ? Math.round((sum[v].g / general.length) * 1000) / 10 : 0,
    holdoutN: spec.holdout.length, generalN: general.length, degenerate: sum[v].deg,
  });
  return { base: mk('base'), cand: mk('cand'), samples };
}

/* qualité d'UNE configuration (instantané manuel) : style sur le jeu de test + culture générale */
export async function scoreVariant(
  ev: Evaluator, variant: Variant,
  spec: { holdout: TrainPair[]; general?: GeneralCheck[]; messagesFor: (q: string, variant: Variant, isGeneral: boolean) => ChatMsg[]; onProgress?: (done: number, total: number) => void },
): Promise<BenchScores> {
  const general = spec.general ?? GENERAL_CHECKS;
  const total = spec.holdout.length + general.length;
  let done = 0, f1 = 0, g = 0, deg = 0;
  for (const p of spec.holdout) {
    const t = (await ev.generate(spec.messagesFor(p.q, variant, false), variant, 96)).trim();
    f1 += tokenF1(t, p.a); if (isDegenerate(t)) deg++;
    spec.onProgress?.(++done, total);
  }
  for (const c of general) {
    const t = await ev.generate(spec.messagesFor(c.prompt, variant, true), variant, 48);
    if (c.re.test(t) && !isDegenerate(t)) g++;
    spec.onProgress?.(++done, total);
  }
  return { style: spec.holdout.length ? Math.round((f1 / spec.holdout.length) * 1000) / 10 : 0, general: general.length ? Math.round((g / general.length) * 1000) / 10 : 0, holdoutN: spec.holdout.length, generalN: general.length, degenerate: deg };
}

export interface DecisionCfg { minHoldout: number; minStyleGain: number; maxGeneralDrop: number; generalFloor: number; maxDegenerateRise: number }
export const DEFAULT_DECISION: DecisionCfg = { minHoldout: 5, minStyleGain: 2, maxGeneralDrop: 10, generalFloor: 60, maxDegenerateRise: 1 };
export interface Decision { verdict: 'pass' | 'fail' | 'inconclusive'; reasons: string[]; styleGain: number; generalDrop: number }

/* PASS seulement si : assez de données de test, gain de style mesuré, pas
   d'oubli (baisse des capacités générales ≤ seuil), pas de dégénérescence. */
export function decide(base: BenchScores, cand: BenchScores, cfg: DecisionCfg = DEFAULT_DECISION): Decision {
  const styleGain = Math.round((cand.style - base.style) * 10) / 10;
  const generalDrop = Math.round((base.general - cand.general) * 10) / 10;
  const reasons: string[] = [];
  if (cand.holdoutN < cfg.minHoldout) {
    return { verdict: 'inconclusive', reasons: ['Jeu de test trop petit (' + cand.holdoutN + ' < ' + cfg.minHoldout + ') : résultat non fiable'], styleGain, generalDrop };
  }
  let fail = false;
  if (generalDrop > cfg.maxGeneralDrop) { fail = true; reasons.push('Oubli détecté : capacités générales −' + generalDrop + ' points (max ' + cfg.maxGeneralDrop + ')'); }
  if (cand.general < cfg.generalFloor) { fail = true; reasons.push('Capacités générales ' + cand.general + ' % sous le plancher de ' + cfg.generalFloor + ' %'); }
  if (cand.degenerate - base.degenerate > cfg.maxDegenerateRise) { fail = true; reasons.push('Réponses dégénérées (vides/répétitives) en hausse'); }
  if (styleGain < cfg.minStyleGain) { fail = true; reasons.push('Aucun gain de style mesuré (' + (styleGain >= 0 ? '+' : '') + styleGain + ' point(s), minimum +' + cfg.minStyleGain + ')'); }
  if (!fail) reasons.push('Style +' + styleGain + ' point(s), capacités générales ' + (generalDrop > 0 ? '−' + generalDrop : 'stables') + ' : validé');
  return { verdict: fail ? 'fail' : 'pass', reasons, styleGain, generalDrop };
}

/* ───────────────────────── fournisseur d'évaluateur (injecté par engine.ts) ───────────────────────── */
export interface AdapterRef { path: string; scale: number }
export type EvaluatorFactory = (modelId: string, adapter: AdapterRef | null) => Promise<Evaluator | null>;
let evaluatorFactory: EvaluatorFactory | null = null;
export function registerEvaluatorFactory(f: EvaluatorFactory | null) { evaluatorFactory = f; }
export const getEvaluatorFactory = () => evaluatorFactory;

/* construit les messages de chat pour une question : avec ou sans profil */
export function profileMessages(q: string, variant: Variant, isGeneral: boolean, train: TrainPair[], rules: string[], system = EXPORT_SYSTEM): ChatMsg[] {
  const msgs: ChatMsg[] = [];
  let sys = system;
  if (variant === 'cand' && !isGeneral) {
    if (rules.length) sys += '\n\nStyle personnel appris :\n' + rules.map(r => '- ' + r).join('\n');
    selectFewShots(q, train.filter(p => norm(p.q) !== norm(q)), 3).forEach(p => { msgs.push({ role: 'user', content: p.q }, { role: 'assistant', content: p.a }); });
  }
  return [{ role: 'system', content: sys }, ...msgs, { role: 'user', content: q }];
}

/* ───────────────────────── entraînement « profil » (Niveau 1) ───────────────────────── */
export const PHASES = ['Préparation du jeu de données', 'Séparation entraînement / test', 'Construction du profil', 'Mesure de départ (avant)', 'Benchmark de qualité (sans / avec profil)', 'Mesure finale (après)', 'Décision'];
export const MIN_PAIRS = 3;

export interface TrainOutcome { run: Run; adapter: Adapter | null; rejected: boolean; report: TrainReport; benches?: BenchSnapshot[] }
export interface TrainReport { verdict: Decision['verdict'] | 'insufficient'; evalMode: AdapterMeta['evalMode']; reasons: string[]; bench?: BenchReport; dataset: { pairs: number; train: number; holdout: number; skipped: Dataset['skipped'] }; rules: string[] }

/* Mémorise le dernier rapport de chaque run (le détail n'est pas dans la base). */
const reports = new Map<string, TrainReport>();
export const reportFor = (runId: string) => reports.get(runId) || null;

/* retrieval-only : à défaut de modèle, mesure la couverture du profil sur le jeu de test
   (F1 entre la cible et l'exemple retrouvé le plus proche). Ce n'est PAS une mesure de qualité du modèle. */
export function retrievalCoverage(train: TrainPair[], holdout: TrainPair[]): number {
  if (!holdout.length) return 0;
  let s = 0;
  for (const h of holdout) { const t = selectFewShots(h.q, train, 1, 0.01)[0]; if (t) s += tokenF1(t.a, h.a); }
  return Math.round((s / holdout.length) * 1000) / 10;
}

export async function trainAndEvaluate(
  data: AppData,
  goal: string,
  opts: DatasetOpts,
  onTick: (progress: number, phase: number) => void
): Promise<TrainOutcome> {
  const ds = datasetFrom(data, opts);
  const run: Run = { id: nid('r'), name: GOAL_NAMES[goal] || goal, startedAt: Date.now(), finishedAt: null, status: 'running', progress: 0 };
  const step = (phase: number, frac = 0) => { run.progress = Math.min(99, ((phase + frac) / PHASES.length) * 100); onTick(run.progress, phase); };
  const yieldUi = () => new Promise<void>(r => setTimeout(r, 0));

  step(0); await yieldUi();
  const { train, holdout } = splitPairs(ds.pairs);
  step(1); await yieldUi();
  const rules = rulesFrom(train.filter(p => p.src === 'example'), goal);
  step(2); await yieldUi();
  const dsInfo = { pairs: ds.pairs.length, train: train.length, holdout: holdout.length, skipped: ds.skipped };
  const finish = (verdict: TrainReport['verdict'], evalMode: AdapterMeta['evalMode'], reasons: string[], bench: BenchReport | undefined, style: number | null, general: number | null, base: { s: number | null; g: number | null }): TrainOutcome => {
    run.progress = 100; run.finishedAt = Date.now();
    const ok = verdict === 'pass' || (verdict === 'inconclusive' && evalMode === 'retrieval');
    run.status = ok ? 'pass' : 'fail';
    if (style !== null) run.styleScore = style;
    if (general !== null) run.generalScore = general;
    const report: TrainReport = { verdict, evalMode, reasons, bench, dataset: dsInfo, rules };
    reports.set(run.id, report);
    let adapter: Adapter | null = null;
    if (ok) {
      const meta: AdapterMeta = { kind: 'profile', evalMode, style, general, baseStyle: base.s, baseGeneral: base.g, holdout: holdout.length, verdict: verdict as Decision['verdict'], reasons };
      adapter = { id: nid('a'), v: 0, name: run.name, createdAt: Date.now(), active: true, examples: ds.pairs.length, styleScore: style ?? 0, generalScore: general ?? 0, rules: packMeta(rules, meta) };
    }
    onTick(100, PHASES.length - 1);
    return { run, adapter, rejected: !ok, report };
  };

  if (train.length < MIN_PAIRS) {
    return finish('insufficient', 'none', ['Pas assez d’exemples : ' + ds.pairs.length + ' utilisable(s), au moins ' + (MIN_PAIRS + 2) + ' requis (ajoutez des exemples ou des 👍).'], undefined, null, null, { s: null, g: null });
  }

  const factory = getEvaluatorFactory();
  const ev = factory && data.settings.installed.includes(data.settings.activeModel) ? await factory(data.settings.activeModel, null).catch(() => null) : null;

  if (!ev || holdout.length < 2) {
    step(3); await yieldUi();
    const cov = retrievalCoverage(train, holdout);
    step(6);
    return finish('inconclusive', 'retrieval', [
      ev ? 'Jeu de test trop petit pour un benchmark génératif.' : 'Aucun modèle exécutable (llama.rn ou poids absents) : benchmark génératif impossible.',
      'Le profil ne modifie pas les poids du modèle ; il est activé sans mesure d’impact sur les capacités générales.',
      'Couverture de style sur le jeu de test (proxy lexical, pas une qualité mesurée) : ' + cov + ' %.',
    ], undefined, cov, null, { s: null, g: null });
  }

  /* 1. MESURE DE DÉPART : vitesse du modèle de base sur des questions fixes (court, moyen) */
  const modelId = data.settings.activeModel;
  const timed = ev.timed ? { timed: ev.timed.bind(ev) } as TimedEvaluator : null;
  const speedMsgs = (variant: Variant) => (q: string): ChatMsg[] => profileMessages(q, variant, variant === 'base', train, rules);
  let speedBefore: SpeedPoint[] = [], speedAfter: SpeedPoint[] = [];
  step(3); await yieldUi();
  try { if (timed) speedBefore = await measureSpeed(timed, speedKinds(false), 'base', speedMsgs('base'), (d, t) => step(3, d / t)); }
  catch { speedBefore = []; /* la vitesse est facultative : le benchmark de qualité continue */ }

  /* 2. QUALITÉ : sans profil / avec profil sur le jeu de test et les questions générales */
  let bench: BenchReport;
  try {
    bench = await runBenchmark(ev, {
      holdout,
      messagesFor: (q, v, g) => profileMessages(q, v, g, train, rules),
      onProgress: (d, t) => step(4, d / t),
    });
  } catch (e) {
    return finish('fail', 'generative', ['Benchmark interrompu : ' + String((e as Error)?.message || e)], undefined, null, null, { s: null, g: null });
  }

  /* 3. MESURE FINALE : même vitesse, avec le profil (ses règles et exemples allongent le prompt : le coût est mesuré, pas supposé) */
  step(5); await yieldUi();
  try { if (timed) speedAfter = await measureSpeed(timed, speedKinds(false), 'cand', speedMsgs('cand'), (d, t) => step(5, d / t)); }
  catch { speedAfter = []; }
  step(6);
  const d = decide(bench.base, bench.cand);
  const out = finish(d.verdict, 'generative', d.reasons, bench, bench.cand.style, bench.cand.general, { s: bench.base.style, g: bench.base.general });
  out.benches = [
    snapshotFrom('avant', 'Avant · ' + run.name, modelId, bench.base, speedBefore, run.id),
    snapshotFrom('apres', 'Après · ' + run.name, modelId, bench.cand, speedAfter, run.id),
  ];
  return out;
}

/* ───────────────────────── LoRA GGUF : lecture d'en-tête & compatibilité ───────────────────────── */
export interface GgufTensor { name: string; dims: number[]; type: number }
export interface GgufInfo { ok: boolean; version: number; tensorCount: number; kvCount: number; kv: Record<string, string | number | boolean>; tensors: GgufTensor[]; truncated: boolean; error?: string }

export function parseGguf(b: Uint8Array): GgufInfo {
  const info: GgufInfo = { ok: false, version: 0, tensorCount: 0, kvCount: 0, kv: {}, tensors: [], truncated: false };
  if (b.length < 24 || b[0] !== 0x47 || b[1] !== 0x47 || b[2] !== 0x55 || b[3] !== 0x46) { info.error = 'Pas un fichier GGUF (signature absente)'; return info; }
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 4;
  const need = (n: number) => { if (p + n > b.length) throw new RangeError('trunc'); };
  const u32 = () => { need(4); const v = dv.getUint32(p, true); p += 4; return v; };
  const u64 = () => { need(8); const v = Number(dv.getBigUint64(p, true)); p += 8; return v; };
  const str = () => { const n = u64(); if (n > 1 << 20) throw new Error('chaîne GGUF absurde'); need(n); const s = new TextDecoder().decode(b.subarray(p, p + n)); p += n; return s; };
  const scalar = (t: number): string | number | boolean | null => {
    switch (t) {
      case 0: need(1); return dv.getUint8(p++);
      case 1: need(1); return dv.getInt8(p++);
      case 2: need(2); p += 2; return dv.getUint16(p - 2, true);
      case 3: need(2); p += 2; return dv.getInt16(p - 2, true);
      case 4: return u32();
      case 5: need(4); p += 4; return dv.getInt32(p - 4, true);
      case 6: need(4); p += 4; return dv.getFloat32(p - 4, true);
      case 7: need(1); return dv.getUint8(p++) !== 0;
      case 8: return str();
      case 10: return u64();
      case 11: need(8); p += 8; return Number(dv.getBigInt64(p - 8, true));
      case 12: need(8); p += 8; return dv.getFloat64(p - 8, true);
      default: throw new Error('type GGUF inconnu ' + t);
    }
  };
  let kvDone = false;
  try {
    info.version = u32();
    if (info.version < 2 || info.version > 3) { info.error = 'Version GGUF non gérée : ' + info.version; return info; }
    info.tensorCount = u64(); info.kvCount = u64();
    if (info.kvCount > 100000 || info.tensorCount > 1000000) { info.error = 'En-tête GGUF incohérent'; return info; }
    for (let i = 0; i < info.kvCount; i++) {
      const key = str(); const t = u32();
      if (t === 9) {
        const et = u32(); const n = u64();
        if (n > 5_000_000) throw new Error('tableau GGUF absurde');
        for (let j = 0; j < n; j++) scalar(et);
      } else { const v = scalar(t); if (v !== null) info.kv[key] = v; }
    }
    kvDone = true;
    for (let i = 0; i < info.tensorCount; i++) {
      const name = str(); const nd = u32(); const dims: number[] = [];
      for (let d = 0; d < nd; d++) dims.push(u64());
      const type = u32(); u64();
      info.tensors.push({ name, dims, type });
    }
    info.ok = true;
  } catch (e) {
    if (e instanceof RangeError) { info.truncated = true; info.ok = kvDone; }
    else info.error = String((e as Error).message || e);
  }
  return info;
}

/* architecture attendue des modèles du catalogue (net.ts) — valeurs des config.json officielles */
export interface BaseSpec { arch: string; nEmbd: number; nLayer: number }
export const BASE_SPECS: Record<string, BaseSpec> = {
  qwen05b: { arch: 'qwen2', nEmbd: 896, nLayer: 24 },
  qwen15b: { arch: 'qwen2', nEmbd: 1536, nLayer: 28 },
  smollm17b: { arch: 'llama', nEmbd: 2048, nLayer: 24 },
};
export const LORA_MAX_BYTES = 512 * 1024 * 1024;
export const LORA_MIN_BYTES = 4 * 1024;

export interface LoraCheck { ok: boolean; errors: string[]; warnings: string[]; arch?: string; rank?: number; alpha?: number; nLayer?: number }
export function checkLoraCompat(info: GgufInfo, modelId: string, sizeBytes: number, fileName = ''): LoraCheck {
  const errors: string[] = [], warnings: string[] = [];
  const spec = BASE_SPECS[modelId];
  if (!spec) errors.push('Modèle de base inconnu : ' + modelId);
  if (!info.ok && !info.truncated) errors.push(info.error || 'En-tête GGUF illisible');
  if (!/\.gguf$/i.test(fileName || '.gguf')) errors.push('Le fichier doit être un .gguf');
  if (sizeBytes < LORA_MIN_BYTES) errors.push('Fichier trop petit pour un adaptateur LoRA');
  if (sizeBytes > LORA_MAX_BYTES) errors.push('Fichier trop volumineux pour un adaptateur LoRA (> 512 Mo)');
  const out: LoraCheck = { ok: false, errors, warnings };
  if (errors.length) return out;
  const kv = info.kv;
  if (kv['general.type'] !== 'adapter') errors.push('Ce GGUF n’est pas un adaptateur (general.type = ' + String(kv['general.type'] ?? 'absent') + ') : un modèle complet ne peut pas être importé ici');
  if (kv['adapter.type'] !== 'lora') errors.push('Type d’adaptateur non géré : ' + String(kv['adapter.type'] ?? 'absent') + ' (LoRA attendu)');
  const arch = String(kv['general.architecture'] ?? '');
  out.arch = arch;
  if (spec && arch && arch !== spec.arch) errors.push('Architecture ' + arch + ' ≠ ' + spec.arch + ' (modèle de base actif)');
  if (!arch) errors.push('Architecture absente des métadonnées');
  const alpha = Number(kv['adapter.lora.alpha']);
  if (Number.isFinite(alpha)) out.alpha = alpha; else warnings.push('adapter.lora.alpha absent');
  /* dimensions : entrée des matrices LoRA A (= n_embd du modèle) et nombre de couches */
  const A = info.tensors.filter(t => /\.lora_a$/.test(t.name));
  if (info.tensors.length && !A.length) errors.push('Aucun tenseur LoRA (.lora_a) trouvé');
  if (info.truncated) warnings.push('En-tête lu partiellement : dimensions vérifiées par le chargeur natif');
  if (spec && A.length) {
    const bad = A.filter(t => /(attn_q|attn_k|attn_v|ffn_gate|ffn_up)\.weight\.lora_a$/.test(t.name) && t.dims[0] !== spec.nEmbd);
    if (bad.length) errors.push('Dimension incompatible : n_embd ' + bad[0].dims[0] + ' ≠ ' + spec.nEmbd + ' attendu (adaptateur entraîné pour un autre modèle)');
    let maxBlk = -1; A.forEach(t => { const m = /^blk\.(\d+)\./.exec(t.name); if (m) maxBlk = Math.max(maxBlk, Number(m[1])); });
    if (maxBlk >= 0) { out.nLayer = maxBlk + 1; if (maxBlk + 1 > spec.nLayer) errors.push('Trop de couches (' + (maxBlk + 1) + ' > ' + spec.nLayer + ')'); }
    const r = A.find(t => t.dims.length >= 2)?.dims[1]; if (r) out.rank = r;
  }
  const name = String(kv['general.base_model.0.name'] ?? kv['general.name'] ?? fileName).toLowerCase();
  if (spec && name) {
    const size = modelId === 'qwen05b' ? '0.5b' : modelId === 'qwen15b' ? '1.5b' : '1.7b';
    const others = ['0.5b', '1.5b', '1.7b', '3b', '7b'].filter(s => s !== size && name.includes(s));
    if (others.length && !name.includes(size)) warnings.push('Le nom évoque un autre modèle (' + others[0] + ') : vérifiez la base d’entraînement');
  }
  out.ok = errors.length === 0;
  return out;
}

/* ───────────────────────── capacités / entraînement sur l'appareil ───────────────────────── */
/* llama.rn 0.13.0-rc.6 n'expose ni llama_opt_init ni llama_opt_epoch (vérifié :
   aucune occurrence dans cpp/, android/, ios/, src/) : aucun entraînement des
   poids n'est possible depuis JS. Ce drapeau passera à true uniquement si une
   future version expose un vrai entraînement ; le garde-fou matériel est prêt. */
export const ON_DEVICE_FINETUNE_AVAILABLE = false;

export interface DeviceEnv { llama: boolean; modelInstalled: boolean; ramBytes: number | null; batteryLevel: number | null; charging: boolean | null; thermalOk?: boolean | null }
export interface Capabilities { onDeviceFinetune: boolean; onDeviceReason: string; loraImport: boolean; loraReason: string; generativeBench: boolean }

export function detectCapabilities(env: DeviceEnv, finetuneAvailable = ON_DEVICE_FINETUNE_AVAILABLE): Capabilities {
  let onDeviceReason = '';
  let onDevice = false;
  if (!finetuneAvailable) onDeviceReason = 'Non disponible : le moteur llama.rn embarqué n’expose pas l’entraînement (llama_opt). Entraînez sur PC puis importez l’adaptateur.';
  else if (!env.llama) onDeviceReason = 'Moteur llama.rn absent (Expo Go).';
  else if (!env.modelInstalled) onDeviceReason = 'Aucun modèle de base installé.';
  else if ((env.ramBytes ?? 0) < 6 * 1024 ** 3) onDeviceReason = 'Mémoire insuffisante (6 Go minimum).';
  else if (!env.charging && (env.batteryLevel ?? 0) < 0.5) onDeviceReason = 'Branchez l’appareil ou attendez 50 % de batterie.';
  else if (env.thermalOk === false) onDeviceReason = 'Appareil trop chaud.';
  else { onDevice = true; onDeviceReason = 'Prêt.'; }
  const loraImport = env.llama && env.modelInstalled;
  const loraReason = loraImport ? 'Prêt : le benchmark local peut tourner.' : !env.llama ? 'Nécessite le build natif (llama.rn absent en Expo Go).' : 'Installez d’abord un modèle de base.';
  return { onDeviceFinetune: onDevice, onDeviceReason, loraImport, loraReason, generativeBench: loraImport };
}

/* ───────────────────────── import LoRA : décision d'enregistrement ───────────────────────── */
export interface LoraImportInput { modelId: string; name: string; file: string; sha256: string; sizeBytes: number; scale: number; check: LoraCheck; examples: number }
/* transforme le résultat d'un benchmark LoRA en run + adaptateur (v attribué par l'appelant) */
export function buildLoraOutcome(inp: LoraImportInput, bench: BenchReport | null, benchError?: string, cfg: DecisionCfg = DEFAULT_DECISION): TrainOutcome {
  const now = Date.now();
  const run: Run = { id: nid('r'), name: inp.name, startedAt: now, finishedAt: now, status: 'fail', progress: 100 };
  let decision: Decision;
  if (!bench) decision = { verdict: 'fail', reasons: [benchError || 'Benchmark impossible : un adaptateur ne peut pas être activé sans évaluation locale'], styleGain: 0, generalDrop: 0 };
  else {
    decision = decide(bench.base, bench.cand, cfg);
    /* un LoRA ne s'active jamais sur un résultat non concluant */
    if (decision.verdict === 'inconclusive') decision = { ...decision, verdict: 'fail' };
  }
  const pass = decision.verdict === 'pass';
  run.status = pass ? 'pass' : 'fail';
  if (bench) { run.styleScore = bench.cand.style; run.generalScore = bench.cand.general; }
  const report: TrainReport = { verdict: decision.verdict, evalMode: bench ? 'generative' : 'none', reasons: decision.reasons, bench: bench || undefined, dataset: { pairs: inp.examples, train: 0, holdout: bench?.cand.holdoutN || 0, skipped: { flagNo: 0, flagMemory: 0, bad: 0, invalid: 0, duplicate: 0 } }, rules: [] };
  reports.set(run.id, report);
  let adapter: Adapter | null = null;
  if (pass && bench) {
    const meta: AdapterMeta = {
      kind: 'lora', evalMode: 'generative', style: bench.cand.style, general: bench.cand.general, baseStyle: bench.base.style, baseGeneral: bench.base.general,
      holdout: bench.cand.holdoutN, verdict: 'pass', reasons: decision.reasons, file: inp.file, sha256: inp.sha256, sizeBytes: inp.sizeBytes,
      baseModel: inp.modelId, scale: inp.scale, arch: inp.check.arch, rank: inp.check.rank, alpha: inp.check.alpha,
    };
    adapter = { id: nid('a'), v: 0, name: inp.name, createdAt: now, active: true, examples: inp.examples, styleScore: bench.cand.style, generalScore: bench.cand.general, rules: packMeta([], meta) };
  }
  return { run, adapter, rejected: !pass, report };
}

/* construit l'instantané « avant » / « après » d'un entraînement */
export function snapshotFrom(phase: BenchSnapshot['phase'], label: string, modelId: string, scores: BenchScores | null, speed: SpeedPoint[], runId?: string): BenchSnapshot {
  return { id: nid('b'), label, ts: Date.now(), modelId, phase, runId, speed, style: scores ? scores.style : null, general: scores ? scores.general : null, holdoutN: scores?.holdoutN ?? 0, generalN: scores?.generalN ?? 0, degenerate: scores ? scores.degenerate : null };
}
export const speedKinds = (full: boolean): Kind[] => (full ? ['court', 'moyen', 'reflexion'] : ['court', 'moyen']);

/* applique un résultat à AppData : version suivante, exclusivité, ancien conservé */
export function applyOutcome(d: AppData, out: TrainOutcome): Adapter | null {
  d.runs.unshift(out.run);
  const keep = (v: number | null) => { (out.benches || []).forEach(b => { if (b.phase === 'apres') b.adapterV = v; }); d.benches = [...(d.benches || []), ...(out.benches || [])].slice(-MAX_SNAPSHOTS); };
  if (!out.adapter) { keep(null); return null; }
  const a: Adapter = { ...out.adapter, v: nextVersion(d.adapters) };
  keep(a.v);
  d.adapters.forEach(x => { x.active = false; });
  d.adapters.push(a);
  return a;
}

/* seul code natif-agnostique de chemin : adapters/v001/adapter.gguf */
export const adapterRelPath = (v: number) => 'adapters/' + fmtVersion(v) + '/adapter.gguf';
