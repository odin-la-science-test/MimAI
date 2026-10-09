/* MiMai — instantanés de benchmark (module pur, testable sous Node : scripts/bench.test.cjs).
   Un instantané = vitesse MESURÉE (temps, premier mot, jetons/s) + qualité MESURÉE (style, culture générale),
   pris avec la configuration active. Un entraînement en prend un AVANT et un APRÈS ; l'utilisateur peut aussi en
   prendre à la main et comparer deux instantanés quelconques. Aucune valeur n'est estimée ni simulée. */
import { BUDGET_MS, KINDS, KIND_LABEL, type Kind } from './speedplan.ts';

export interface SpeedPoint { kind: Kind; ms: number; ttftMs: number | null; tokens: number; tps: number | null; cut: boolean; ok: boolean }
export interface BenchSnapshot {
  id: string; label: string; ts: number; modelId: string;
  phase: 'avant' | 'apres' | 'manuel';
  runId?: string; adapterV?: number | null;
  speed: SpeedPoint[];
  style: number | null; general: number | null; holdoutN: number; generalN: number; degenerate: number | null;
}

/* questions fixes : mêmes entrées avant/après, donc comparables */
export const SPEED_PROMPTS: Record<Kind, string> = {
  court: 'Quelle est la capitale de la France ?',
  moyen: 'Explique en quelques phrases la différence entre la mémoire vive et le stockage d’un téléphone.',
  reflexion: 'Un train part à 14 h à 80 km/h et un autre part à 14 h 30 à 100 km/h dans la même direction. À quelle heure le second rattrape-t-il le premier ?',
};

export interface TimedResult { text: string; ms: number; ttftMs: number | null; tokens: number; tps: number | null; cut: boolean }
export interface TimedEvaluator { timed(messages: { role: 'system' | 'user' | 'assistant'; content: string }[], variant: 'base' | 'cand', kind: Kind): Promise<TimedResult> }

export async function measureSpeed(
  ev: TimedEvaluator, kinds: Kind[], variant: 'base' | 'cand',
  messagesFor: (q: string, variant: 'base' | 'cand', kind: Kind) => { role: 'system' | 'user' | 'assistant'; content: string }[],
  onEach?: (done: number, total: number) => void,
): Promise<SpeedPoint[]> {
  const out: SpeedPoint[] = [];
  for (const kind of kinds) {
    const r = await ev.timed(messagesFor(SPEED_PROMPTS[kind], variant, kind), variant, kind);
    out.push({ kind, ms: r.ms, ttftMs: r.ttftMs, tokens: r.tokens, tps: r.tps, cut: r.cut, ok: r.ms <= BUDGET_MS[kind] + 500 });
    onEach?.(out.length, kinds.length);
  }
  return out;
}

export const secs = (ms: number) => Math.round(ms / 100) / 10;

export interface Row { label: string; before: string; after: string; delta: string; better: boolean | null }

const fmt = (n: number, d = 1) => String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',');
const signed = (n: number, d = 1) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n), d);

/* compare deux instantanés ; « better » = vrai si l'après est meilleur (temps plus court, qualité plus haute), null si égal/non mesuré */
export function compare(a: BenchSnapshot, b: BenchSnapshot): Row[] {
  const rows: Row[] = [];
  for (const k of KINDS) {
    const pa = a.speed.find(p => p.kind === k), pb = b.speed.find(p => p.kind === k);
    if (!pa || !pb) continue;
    const d = secs(pb.ms) - secs(pa.ms);
    rows.push({ label: KIND_LABEL[k] + ' · temps', before: fmt(secs(pa.ms)) + ' s', after: fmt(secs(pb.ms)) + ' s' + (pb.ok ? '' : ' (> ' + BUDGET_MS[k] / 1000 + ' s)'), delta: signed(d) + ' s', better: Math.abs(d) < 0.05 ? null : d < 0 });
  }
  const tp = (s: BenchSnapshot) => { const v = s.speed.map(p => p.tps).filter((x): x is number => !!x); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const ta = tp(a), tb = tp(b);
  if (ta !== null && tb !== null) rows.push({ label: 'Vitesse de génération', before: fmt(ta) + ' jetons/s', after: fmt(tb) + ' jetons/s', delta: signed(tb - ta) + '', better: Math.abs(tb - ta) < 0.05 ? null : tb > ta });
  const ft = (s: BenchSnapshot) => { const v = s.speed.map(p => p.ttftMs).filter((x): x is number => x !== null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const fa = ft(a), fb = ft(b);
  if (fa !== null && fb !== null) rows.push({ label: 'Premier mot', before: fmt(secs(fa)) + ' s', after: fmt(secs(fb)) + ' s', delta: signed(secs(fb) - secs(fa)) + ' s', better: Math.abs(fb - fa) < 50 ? null : fb < fa });
  const q = (label: string, x: number | null, y: number | null) => {
    if (x === null || y === null) return;
    rows.push({ label, before: fmt(x) + ' %', after: fmt(y) + ' %', delta: signed(y - x) + ' pt', better: Math.abs(y - x) < 0.05 ? null : y > x });
  };
  q('Style (proximité avec vos réponses)', a.style, b.style);
  q('Culture générale', a.general, b.general);
  return rows;
}

/* phrase de synthèse honnête : ce qui s'améliore, ce qui se dégrade, ce qui n'est pas mesuré */
export function verdictLines(rows: Row[]): string[] {
  if (!rows.length) return ['Rien de comparable entre ces deux mesures.'];
  const up = rows.filter(r => r.better === true).length, down = rows.filter(r => r.better === false).length;
  const out = [up + ' mesure(s) améliorée(s), ' + down + ' dégradée(s), ' + (rows.length - up - down) + ' inchangée(s).'];
  rows.filter(r => r.better === false).forEach(r => out.push('À surveiller : ' + r.label + ' (' + r.before + ' → ' + r.after + ').'));
  return out;
}

export const snapshotTitle = (s: BenchSnapshot) => s.label;
export const MAX_SNAPSHOTS = 40;
