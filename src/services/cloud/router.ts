/* MiMai — choix du modèle en ligne et BASCULE AUTOMATIQUE (module pur, testable sous Node : scripts/cloud.test.cjs).
   Pour chaque demande, on classe tous les (fournisseur, modèle) utilisables d'après : la taille de la demande, ce qu'il reste de
   quota aujourd'hui, la priorité donnée par l'utilisateur. On essaie le meilleur ; au moindre refus (limite, panne, clé, modèle
   disparu) on passe au suivant dans la foulée, sans rien demander ni afficher. */
import type { ProviderDef, ModelInfo, Tier } from './providers.ts';
import { PROVIDER_BY_ID } from './providers.ts';
import type { QuotaEntry, QuotaMap, Failure, RateHints } from './quota.ts';
import { canUse, remainingFraction, roll, providerKey, modelKey } from './quota.ts';

export type Kind = 'court' | 'moyen' | 'reflexion';

export interface ProviderCfg {
  enabled: boolean;
  order: number;            // 0 = priorité la plus haute
  account?: string;         // identifiant de compte (Cloudflare)
  models: ModelInfo[];
  refreshedAt?: number;
}
export type ProvidersCfg = Record<string, ProviderCfg>;

export interface RouteReq { kind: Kind; needVision: boolean; estTokens: number }
export interface Candidate { def: ProviderDef; model: ModelInfo; account?: string; score: number }

/* adéquation d'un niveau de modèle à la demande */
const FIT: Record<Kind, Record<Tier, number>> = {
  court: { fast: 3, balanced: 2, strong: 1 },
  moyen: { balanced: 3, strong: 2.4, fast: 2 },
  reflexion: { strong: 3, balanced: 2, fast: 1 },
};

export function buildCandidates(cfg: ProvidersCfg, hasKey: (id: string) => boolean, quota: QuotaMap, now: number, req: RouteReq): Candidate[] {
  const out: Candidate[] = [];
  for (const id of Object.keys(cfg)) {
    const pc = cfg[id];
    const def = PROVIDER_BY_ID[id];
    if (!def || !pc.enabled || !hasKey(id)) continue;
    if (def.needsAccount && !pc.account) continue;
    const pe = roll(quota[providerKey(def)], now, def.resetTz);
    for (const m of pc.models) {
      if (req.needVision && !m.vision) continue;
      const me = roll(quota[modelKey(def, m.id)], now, def.resetTz);
      if (!canUse(def, [pe, me], now, req.estTokens).ok) continue;
      const left = remainingFraction(def, def.scope === 'model' ? me : pe);
      const score = FIT[req.kind][m.tier] * 100 + (req.kind === 'reflexion' && m.reasoning ? 40 : 0) + left * 30 - pc.order * 6;
      out.push({ def, model: m, account: pc.account, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/* l'erreur qu'un essai doit lever pour déclencher la bascule */
export class CloudError extends Error {
  constructor(public failure: Failure, public headers: Record<string, string> = {}) { super(failure.reason); }
}

export interface AttemptResult<T> { value: T; tokensIn: number; tokensOut: number; hints: RateHints }
export interface Hooks<T> {
  now(): number;
  onSuccess(c: Candidate, r: AttemptResult<T>): void;
  onFailure(c: Candidate, f: Failure, headers: Record<string, string>): void;
}
export type RunOutcome<T> = { ok: true; value: T; cand: Candidate; tried: number } | { ok: false; tried: number; last?: Failure };

/* essaie les candidats dans l'ordre ; un échec de compte (clé, quota, panne) écarte tout le fournisseur pour cette demande */
export async function runWithFailover<T>(
  cands: Candidate[], attempt: (c: Candidate) => Promise<AttemptResult<T>>, hooks: Hooks<T>,
  opts: { maxAttempts: number; budgetMs: number },
): Promise<RunOutcome<T>> {
  const t0 = hooks.now();
  const skip = new Set<string>();
  const skipModel = new Set<string>();
  let tried = 0;
  let last: Failure | undefined;
  for (const c of cands) {
    if (tried >= opts.maxAttempts) break;
    if (hooks.now() - t0 > opts.budgetMs) break;
    if (skip.has(c.def.id) || skipModel.has(c.def.id + '|' + c.model.id)) continue;
    tried++;
    try {
      const r = await attempt(c);
      hooks.onSuccess(c, r);
      return { ok: true, value: r.value, cand: c, tried };
    } catch (e) {
      const f: Failure = e instanceof CloudError ? e.failure : { kind: 'server', reason: String((e as Error)?.message || e).slice(0, 160) };
      const headers = e instanceof CloudError ? e.headers : {};
      last = f;
      hooks.onFailure(c, f, headers);
      /* clé refusée ou panne : tout le fournisseur ; limite : tout le fournisseur si elle est commune à ses modèles, sinon ce modèle seul */
      if (f.kind === 'auth' || f.kind === 'server') skip.add(c.def.id);
      else if ((f.kind === 'quota' || f.kind === 'rate') && c.def.scope === 'provider') skip.add(c.def.id);
      else skipModel.add(c.def.id + '|' + c.model.id);
    }
  }
  return { ok: false, tried, last };
}

/* état d'un fournisseur pour l'affichage : « ok », « limite atteinte jusqu'à… », « clé refusée »… */
export interface ProviderStatus { state: 'ok' | 'limited' | 'auth' | 'down' | 'off'; until?: number; reason?: string }
export function statusOf(def: ProviderDef, pc: ProviderCfg | undefined, hasKey: boolean, quota: QuotaMap, now: number): ProviderStatus {
  if (!pc || !pc.enabled || !hasKey) return { state: 'off' };
  const pe = roll(quota[providerKey(def)], now, def.resetTz);
  if (pe.blockKind === 'auth' && now < pe.blockedUntil) return { state: 'auth', reason: pe.blockReason };
  if (now < pe.blockedUntil) return { state: pe.blockKind === 'server' ? 'down' : 'limited', until: pe.blockedUntil, reason: pe.blockReason };
  const usable = pc.models.filter(m => { const me = roll(quota[modelKey(def, m.id)], now, def.resetTz); return canUse(def, [pe, me], now, 500).ok; });
  if (!usable.length && pc.models.length) return { state: 'limited', reason: 'tous les modèles ont atteint leur limite du jour' };
  return { state: 'ok' };
}
