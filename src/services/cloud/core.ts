/* MiMai — cœur de l'IA en ligne gratuite (module pur : les accès réseau et le coffre de clés sont INJECTÉS, donc testable
   sous Node avec de faux fournisseurs : scripts/cloud.test.cjs).
   Tâches automatiques : connexion d'une clé (validation + découverte des modèles), suivi des limites, choix du meilleur
   (fournisseur, modèle), bascule silencieuse au moindre refus, remise à jour quotidienne de la liste des modèles. */
import type { ModelInfo, ProviderId } from './providers.ts';
import { PROVIDER_BY_ID, PROVIDERS, pickModels, classifyModel } from './providers.ts';
import type { QuotaMap, QuotaEntry, Failure } from './quota.ts';
import { roll, providerKey, modelKey, recordUsage, applyFailure, applySuccess, parseRateHeaders, usedOf, limitOf, remainingFraction } from './quota.ts';
import type { ProvidersCfg, Kind, Candidate, ProviderStatus } from './router.ts';
import { buildCandidates, runWithFailover, CloudError, statusOf } from './router.ts';

export type Policy = 'auto' | 'local-first' | 'cloud-only';

export interface CloudSettings {
  enabled: boolean;
  policy: Policy;
  /* partage de la mémoire, de la bibliothèque et des exemples d'entraînement avec le fournisseur (désactivé par défaut) */
  shareContext: boolean;
  /* envoi des photos (fonction Vision) au fournisseur (désactivé par défaut) */
  sharePhotos: boolean;
  providers: ProvidersCfg;
  quota: QuotaMap;
  refreshedAt?: number;
  /* journal court (sans contenu) des bascules, lisible dans l'écran de l'IA en ligne */
  events?: { t: number; msg: string }[];
}
export const defaultCloud = (): CloudSettings => ({ enabled: false, policy: 'auto', shareContext: false, sharePhotos: false, providers: {}, quota: {}, events: [] });

export interface ChatOpts { maxTokens: number; temperature: number; timeoutMs: number; totalMs: number; onText?: (t: string) => void }
export interface ChatResult { text: string; tokensIn: number; tokensOut: number; finish?: string; headers: Record<string, string> }

export interface Deps {
  chat(providerId: ProviderId, key: string, account: string | undefined, model: string, messages: unknown[], o: ChatOpts): Promise<ChatResult>;       /* lève CloudError */
  listModels(providerId: ProviderId, key: string, account: string | undefined): Promise<{ id: string; pricing?: { prompt?: string; completion?: string } }[]>; /* lève CloudError */
  getKey(id: string): string | null;
  setKey(id: string, key: string | null): Promise<void>;
  now(): number;
  get(): CloudSettings;
  set(fn: (c: CloudSettings) => void): void;
}

export interface CloudRequest {
  messages: unknown[];
  kind: Kind;
  needVision: boolean;
  maxTokens: number;
  temperature?: number;
  promptChars: number;
  onText?: (t: string) => void;
  budgetMs: number;
}
export interface CloudAnswer { text: string; provider: string; providerId: ProviderId; model: string; tokens: number; ms: number; cut: boolean; tried: number }

const EVENTS_MAX = 30;

export class CloudEngine {
  constructor(private d: Deps) {}

  private log(msg: string) {
    this.d.set(c => { c.events = [...(c.events || []), { t: this.d.now(), msg }].slice(-EVENTS_MAX); });
  }

  /* faut-il essayer le cloud pour cette demande ? (rapide, sans réseau) */
  available(kind: Kind, needVision: boolean, promptChars = 0, maxTokens = 300): boolean {
    const c = this.d.get();
    if (!c.enabled) return false;
    return buildCandidates(c.providers, id => !!this.d.getKey(id), c.quota, this.d.now(), { kind, needVision, estTokens: maxTokens + promptChars / 3.5 }).length > 0;
  }

  /* la réponse, ou null si aucun fournisseur n'a pu répondre (l'appelant retombe alors sur le modèle local, sans rien dire) */
  async complete(req: CloudRequest): Promise<CloudAnswer | null> {
    const c0 = this.d.get();
    if (!c0.enabled) return null;
    const now = this.d.now();
    const est = req.maxTokens + req.promptChars / 3.5;
    const cands = buildCandidates(c0.providers, id => !!this.d.getKey(id), c0.quota, now, { kind: req.kind, needVision: req.needVision, estTokens: est });
    if (!cands.length) return null;
    const t0 = now;
    const out = await runWithFailover(
      cands,
      async (cand: Candidate) => {
        const key = this.d.getKey(cand.def.id);
        if (!key) throw new CloudError({ kind: 'auth', reason: 'clé absente' });
        const left = Math.max(2000, req.budgetMs - (this.d.now() - t0));
        const r = await this.d.chat(cand.def.id, key, cand.account, cand.model.id, req.messages, {
          maxTokens: req.maxTokens, temperature: req.temperature ?? 0.7,
          timeoutMs: Math.min(8000, left), totalMs: left, onText: req.onText,
        });
        return { value: r, tokensIn: r.tokensIn, tokensOut: r.tokensOut, hints: parseRateHeaders(r.headers) };
      },
      {
        now: () => this.d.now(),
        onSuccess: (cand, r) => this.success(cand, r.tokensIn, r.tokensOut, r.hints),
        onFailure: (cand, f) => this.failure(cand, f),
      },
      { maxAttempts: 6, budgetMs: req.budgetMs },
    );
    if (!out.ok) { this.log('Aucun fournisseur disponible (' + out.tried + ' essai(s))' + (out.last ? ' — ' + out.last.kind : '')); return null; }
    const r = out.value;
    if (out.tried > 1) this.log('Bascule vers ' + out.cand.def.name + ' / ' + out.cand.model.id + ' après ' + (out.tried - 1) + ' refus');
    return {
      text: r.text, provider: out.cand.def.name, providerId: out.cand.def.id, model: out.cand.model.id,
      tokens: r.tokensIn + r.tokensOut, ms: this.d.now() - t0, cut: r.finish === 'length', tried: out.tried,
    };
  }

  /* ───────── suivi ───────── */
  private success(cand: Candidate, tIn: number, tOut: number, hints: ReturnType<typeof parseRateHeaders>) {
    const now = this.d.now();
    this.d.set(c => {
      const def = cand.def;
      const pk = providerKey(def), mk = modelKey(def, cand.model.id);
      let pe = roll(c.quota[pk], now, def.resetTz), me = roll(c.quota[mk], now, def.resetTz);
      pe = recordUsage(def, pe, cand.model.id, tIn, tOut); me = recordUsage(def, me, cand.model.id, tIn, tOut);
      /* les en-têtes décrivent la limite du compte (provider) ou du modèle selon le fournisseur */
      if (def.scope === 'model') me = applySuccess(def, me, hints, now); else pe = applySuccess(def, pe, hints, now);
      if (def.scope === 'model') pe = { ...pe, fails: 0, lastOkAt: now, ...(pe.blockKind === 'server' ? { blockedUntil: 0, blockKind: undefined, blockReason: undefined } : {}) };
      c.quota[pk] = pe; c.quota[mk] = me;
    });
  }

  private failure(cand: Candidate, f: Failure) {
    const now = this.d.now();
    this.d.set(c => {
      const def = cand.def;
      const pk = providerKey(def), mk = modelKey(def, cand.model.id);
      const pe = roll(c.quota[pk], now, def.resetTz), me = roll(c.quota[mk], now, def.resetTz);
      const onModel = f.kind === 'model' || ((f.kind === 'quota' || f.kind === 'rate') && def.scope === 'model');
      if (f.kind === 'bad_request') { c.quota[pk] = pe; c.quota[mk] = me; return; }
      if (onModel) { c.quota[mk] = applyFailure(def, me, f, now); c.quota[pk] = pe; }
      else { c.quota[pk] = applyFailure(def, pe, f, now); c.quota[mk] = me; }
    });
    this.log(cand.def.name + ' / ' + cand.model.id + ' : ' + ({ rate: 'limite momentanée', quota: 'limite du jour atteinte', auth: 'clé refusée', server: 'indisponible', model: 'modèle indisponible', bad_request: 'requête refusée' } as Record<string, string>)[f.kind]);
  }

  /* ───────── connexion d'une clé : validation + découverte des modèles ───────── */
  async connect(id: ProviderId, key: string, account?: string): Promise<{ ok: true; models: number } | { ok: false; error: string }> {
    const def = PROVIDER_BY_ID[id];
    const k = key.trim();
    if (!def) return { ok: false, error: 'Fournisseur inconnu.' };
    if (!k) return { ok: false, error: 'Collez d’abord votre clé.' };
    if (def.needsAccount && !(account || '').trim()) return { ok: false, error: 'L’identifiant de compte est nécessaire pour ' + def.name + '.' };
    let models: ModelInfo[];
    try {
      if (def.models === 'openai') {
        const raw = await this.d.listModels(id, k, account?.trim());
        models = pickModels(id, raw, def.idPrefix);
      } else {
        models = (def.staticModels || []).map(m => classifyModel(m, id)).filter((m): m is ModelInfo => !!m);
        /* pas de liste à lire : on valide par une toute petite requête */
        await this.d.chat(id, k, account?.trim(), models[0].id, [{ role: 'user', content: 'ok' }], { maxTokens: 1, temperature: 0, timeoutMs: 10000, totalMs: 10000 });
      }
    } catch (e) {
      const f = e instanceof CloudError ? e.failure : null;
      if (f?.kind === 'auth') return { ok: false, error: 'Clé refusée par ' + def.name + '. Vérifiez-la (copiez-la en entier).' };
      if (f?.kind === 'server') return { ok: false, error: def.name + ' ne répond pas pour l’instant (vérifiez votre connexion), réessayez.' };
      if (f?.kind === 'rate' || f?.kind === 'quota') return { ok: false, error: def.name + ' a atteint sa limite : la clé est probablement bonne, réessayez plus tard.' };
      return { ok: false, error: 'Connexion impossible (' + String((e as Error)?.message || e).slice(0, 100) + ').' };
    }
    if (!models.length) return { ok: false, error: 'Clé valide, mais aucun modèle gratuit de discussion n’est disponible chez ' + def.name + '.' };
    await this.d.setKey(id, k);
    this.d.set(c => {
      const order = c.providers[id]?.order ?? Object.keys(c.providers).length;
      c.providers[id] = { enabled: true, order, account: account?.trim() || undefined, models, refreshedAt: this.d.now() };
      /* une clé neuve lève un éventuel blocage « clé refusée » */
      const pk = providerKey(def);
      if (c.quota[pk]?.blockKind === 'auth') c.quota[pk] = { ...c.quota[pk], blockedUntil: 0, blockKind: undefined, blockReason: undefined };
    });
    this.log(def.name + ' connecté (' + models.length + ' modèles)');
    return { ok: true, models: models.length };
  }

  async disconnect(id: ProviderId): Promise<void> {
    await this.d.setKey(id, null);
    this.d.set(c => { delete c.providers[id]; delete c.quota[providerKey(PROVIDER_BY_ID[id])]; });
  }

  /* remise à jour automatique de la liste des modèles (modèles disparus, nouveaux) : au plus une fois par jour et par fournisseur */
  async refreshModels(force = false): Promise<void> {
    const c = this.d.get();
    if (!c.enabled) return;
    for (const def of PROVIDERS) {
      const pc = c.providers[def.id];
      const key = this.d.getKey(def.id);
      if (!pc || !pc.enabled || !key || def.models !== 'openai') continue;
      if (!force && pc.refreshedAt && this.d.now() - pc.refreshedAt < 24 * 3_600_000) continue;
      try {
        const raw = await this.d.listModels(def.id, key, pc.account);
        const models = pickModels(def.id, raw, def.idPrefix);
        if (models.length) this.d.set(cc => { if (cc.providers[def.id]) { cc.providers[def.id].models = models; cc.providers[def.id].refreshedAt = this.d.now(); } });
      } catch (e) {
        if (e instanceof CloudError && e.failure.kind === 'auth') this.failure({ def, model: pc.models[0] || { id: '*', tier: 'balanced', vision: false, reasoning: false, free: true }, account: pc.account, score: 0 }, e.failure);
      }
    }
  }

  /* ───────── affichage ───────── */
  summary(): { id: ProviderId; name: string; status: ProviderStatus; usedToday: number; limit: number | null; unit: 'jetons' | 'neurones'; requests: number; models: number; remaining: number }[] {
    const c = this.d.get();
    const now = this.d.now();
    return PROVIDERS.map(def => {
      const pc = c.providers[def.id];
      const pe = roll(c.quota[providerKey(def)], now, def.resetTz);
      return {
        id: def.id, name: def.name,
        status: statusOf(def, pc, !!this.d.getKey(def.id), c.quota, now),
        usedToday: Math.round(usedOf(def, pe)), limit: limitOf(def), unit: def.dailyNeurons ? 'neurones' as const : 'jetons' as const,
        requests: pe.requests, models: pc ? pc.models.length : 0, remaining: remainingFraction(def, pe),
      };
    });
  }
}
export type { QuotaEntry };
