/* MiMai — suivi des limites d'utilisation des IA en ligne (module pur, testable sous Node : scripts/cloud.test.cjs).
   Deux sources, jamais une seule :
   1. nos propres compteurs (jetons / neurones du jour, requêtes) ;
   2. ce que le fournisseur dit : en-têtes de limite des réponses et erreurs 429.
   Chaque entrée porte un éventuel blocage (« pas avant … ») qui se lève tout seul : à l'heure indiquée par le fournisseur, ou
   au prochain minuit du fuseau de remise à zéro. Rien ici n'est visible de l'utilisateur : la bascule est faite par router.ts. */
import type { ProviderDef } from './providers.ts';

export type FailKind = 'rate' | 'quota' | 'auth' | 'server' | 'model' | 'bad_request';

export interface QuotaEntry {
  day: string;
  tokens: number; requests: number; neurons: number;
  blockedUntil: number; blockKind?: FailKind; blockReason?: string;
  fails: number;
  remTokens?: number; remRequests?: number; remAt?: number;
  lastOkAt?: number;
}
export type QuotaMap = Record<string, QuotaEntry>;

/* ───────── jours et fuseaux (sans Intl : Hermes ne le garantit pas) ───────── */
const DAY = 86_400_000;

/* heure d'été américaine : du 2e dimanche de mars (2 h) au 1er dimanche de novembre (2 h) */
function isUsDst(utcMs: number): boolean {
  const y = new Date(utcMs).getUTCFullYear();
  const sun = (month: number, nth: number) => { const dow = new Date(Date.UTC(y, month, 1)).getUTCDay(); return 1 + ((7 - dow) % 7) + (nth - 1) * 7; };
  const start = Date.UTC(y, 2, sun(2, 2), 10);   // 2 h PST = 10 h UTC
  const end = Date.UTC(y, 10, sun(10, 1), 9);     // 2 h PDT = 9 h UTC
  return utcMs >= start && utcMs < end;
}
export const tzOffsetMin = (nowMs: number, tz: ProviderDef['resetTz']): number => (tz === 'UTC' ? 0 : isUsDst(nowMs) ? -420 : -480);

export function dayKey(nowMs: number, tz: ProviderDef['resetTz'] = 'UTC'): string {
  return new Date(nowMs + tzOffsetMin(nowMs, tz) * 60_000).toISOString().slice(0, 10);
}
/* prochain minuit du fuseau (instant UTC) */
export function nextResetMs(nowMs: number, tz: ProviderDef['resetTz'] = 'UTC'): number {
  const off = tzOffsetMin(nowMs, tz) * 60_000;
  return (Math.floor((nowMs + off) / DAY) + 1) * DAY - off;
}

export const emptyEntry = (day: string): QuotaEntry => ({ day, tokens: 0, requests: 0, neurons: 0, blockedUntil: 0, fails: 0 });

/* clés : « fournisseur|* » = état du compte ; « fournisseur|modèle » = état du modèle */
export const providerKey = (def: ProviderDef) => def.id + '|*';
export const modelKey = (def: ProviderDef, model: string) => def.id + '|' + model;

/* nouveau jour : compteurs remis à zéro et blocages « du jour » levés (une clé refusée reste refusée) */
export function roll(e: QuotaEntry | undefined, now: number, tz: ProviderDef['resetTz']): QuotaEntry {
  const today = dayKey(now, tz);
  if (!e) return emptyEntry(today);
  if (e.day === today) return e;
  const keepBlock = e.blockKind === 'auth' && e.blockedUntil > now;
  return { ...emptyEntry(today), ...(keepBlock ? { blockedUntil: e.blockedUntil, blockKind: e.blockKind, blockReason: e.blockReason } : {}) };
}

/* ───────── consommation ───────── */
const LARGE = /(70b|72b|90b|120b|32b|24b|405b|235b)/i;
/* Cloudflare : neurones estimés d'après ses tarifs publiés (≈ 25 600 neurones/M jetons entrants et 75 000/M sortants pour un
   petit modèle ; ≈ 205 000/M sortants pour un grand). C'est une ESTIMATION : la limite réelle est confirmée par les erreurs. */
export function neuronsFor(model: string, tokensIn: number, tokensOut: number): number {
  const big = LARGE.test(model);
  return tokensIn * (big ? 0.0267 : 0.0256) + tokensOut * (big ? 0.205 : 0.0751);
}

export const limitOf = (def: ProviderDef): number | null => (def.dailyNeurons ?? def.dailyTokens ?? null);
export const usedOf = (def: ProviderDef, e: QuotaEntry): number => (def.dailyNeurons ? e.neurons : e.tokens);

/* part restante aujourd'hui (1 = tout, 0 = épuisé ; 1 si la limite est inconnue) */
export function remainingFraction(def: ProviderDef, e: QuotaEntry | undefined): number {
  const lim = limitOf(def);
  if (!lim || !e) return 1;
  return Math.max(0, 1 - usedOf(def, e) / lim);
}

export function recordUsage(def: ProviderDef, e: QuotaEntry, model: string, tokensIn: number, tokensOut: number): QuotaEntry {
  return { ...e, tokens: e.tokens + tokensIn + tokensOut, requests: e.requests + 1, neurons: e.neurons + (def.dailyNeurons ? neuronsFor(model, tokensIn, tokensOut) : 0) };
}

/* ce fournisseur / ce modèle est-il utilisable maintenant pour une réponse d'environ estTokens ? */
export function canUse(def: ProviderDef, entries: QuotaEntry[], now: number, estTokens: number): { ok: boolean; why?: FailKind } {
  for (const e of entries) {
    if (now < e.blockedUntil) return { ok: false, why: e.blockKind || 'rate' };
  }
  const lim = limitOf(def);
  if (lim) {
    const e = def.scope === 'model' ? entries[entries.length - 1] : entries[0];
    const est = def.dailyNeurons ? estTokens * 0.08 : estTokens;
    if (usedOf(def, e) + est > lim * 0.97) return { ok: false, why: 'quota' };
  }
  return { ok: true };
}

/* ───────── en-têtes de limite des fournisseurs ───────── */
/* « 1m30.5s », « 2.5s », « 6h12m », « 120 », « 45ms » → millisecondes */
export function parseDuration(s: string | undefined | null): number | null {
  if (s == null) return null;
  const t = String(s).trim().toLowerCase();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 1000);
  const re = /(\d+(?:\.\d+)?)(ms|d|h|m|s)/g;
  let ms = 0, found = false, m: RegExpExecArray | null;
  while ((m = re.exec(t))) { found = true; const v = parseFloat(m[1]); ms += m[2] === 'ms' ? v : m[2] === 's' ? v * 1000 : m[2] === 'm' ? v * 60_000 : m[2] === 'h' ? v * 3_600_000 : v * DAY; }
  return found ? Math.round(ms) : null;
}

export interface RateHints { remTokens?: number; remRequests?: number; resetMs?: number }
/* lit les en-têtes « x-ratelimit-* » (Groq, Cerebras, OpenRouter…) : on garde le PLUS BAS des restes et le plus long délai */
export function parseRateHeaders(h: Record<string, string>): RateHints {
  const out: RateHints = {};
  for (const k of Object.keys(h || {})) {
    const key = k.toLowerCase();
    const v = h[k];
    if (key.startsWith('x-ratelimit-remaining-') || key === 'x-ratelimit-remaining') {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      if (/token/.test(key)) out.remTokens = out.remTokens === undefined ? n : Math.min(out.remTokens, n);
      else out.remRequests = out.remRequests === undefined ? n : Math.min(out.remRequests, n);
    } else if (key.startsWith('x-ratelimit-reset')) {
      const d = parseDuration(v);
      if (d != null) out.resetMs = Math.max(out.resetMs ?? 0, d);
    } else if (key === 'retry-after') {
      const d = parseDuration(v);
      if (d != null) out.resetMs = Math.max(out.resetMs ?? 0, d);
    }
  }
  return out;
}

/* ───────── erreurs ───────── */
export interface Failure { kind: FailKind; retryMs?: number; reason: string }
const DAILY = /(per day|daily|tokens per day|requests per day|\btpd\b|\brpd\b|perday|quota exceeded|exceeded your current quota|neurons|free tier|insufficient_quota)/i;
const AUTHBAD = /(api key|apikey|unauthor|authentic|invalid.*key|permission|forbidden|not authorized)/i;
const MODELBAD = /(model.*(not found|does not exist|decommission|deprecated|not supported|unavailable|no longer|invalid)|(not found|unknown|invalid).*model)/i;

export function classifyFailure(status: number, body: string, headers: Record<string, string> = {}): Failure {
  const text = String(body || '').slice(0, 1500);
  const hints = parseRateHeaders(headers);
  const reason = ('HTTP ' + status + ' ' + text.replace(/\s+/g, ' ').slice(0, 140)).trim();
  if (status === 401 || status === 403) return { kind: 'auth', reason };
  if (status === 400 && AUTHBAD.test(text) && !MODELBAD.test(text)) return { kind: 'auth', reason };
  if (status === 429) {
    if (DAILY.test(text) && !/per minute|per second|rate limit reached for.*per minute/i.test(text)) return { kind: 'quota', reason };
    const retry = hints.resetMs ?? 20_000;
    return retry > 15 * 60_000 ? { kind: 'quota', reason } : { kind: 'rate', retryMs: retry, reason };
  }
  if (status === 404 || status === 400 || status === 422) return MODELBAD.test(text) || status === 404 ? { kind: 'model', reason } : { kind: 'bad_request', reason };
  if (status === 413) return { kind: 'bad_request', reason };
  if (status === 0 || status === 408 || status >= 500) return { kind: 'server', reason };
  return { kind: 'bad_request', reason };
}

/* applique un échec : retourne la nouvelle entrée (avec un blocage qui se lève tout seul) */
export function applyFailure(def: ProviderDef, e: QuotaEntry, f: Failure, now: number): QuotaEntry {
  switch (f.kind) {
    case 'auth': return { ...e, blockedUntil: Number.MAX_SAFE_INTEGER, blockKind: 'auth', blockReason: f.reason };
    case 'quota': return { ...e, blockedUntil: nextResetMs(now, def.resetTz) + 30_000, blockKind: 'quota', blockReason: f.reason };
    case 'rate': return { ...e, blockedUntil: now + Math.max(3_000, Math.min(15 * 60_000, f.retryMs ?? 20_000)), blockKind: 'rate', blockReason: f.reason };
    case 'model': return { ...e, blockedUntil: now + DAY, blockKind: 'model', blockReason: f.reason };
    case 'server': {
      const fails = e.fails + 1;
      return { ...e, fails, blockedUntil: now + Math.min(5 * 60_000, 15_000 * Math.pow(2, fails - 1)), blockKind: 'server', blockReason: f.reason };
    }
    default: return e;   // requête mal formée : on n'accuse ni le fournisseur ni le modèle
  }
}

/* succès : remet les échecs à zéro, mémorise les restes annoncés ; reste à 0 → blocage jusqu'à la remise à zéro */
export function applySuccess(def: ProviderDef, e: QuotaEntry, hints: RateHints, now: number): QuotaEntry {
  const keep = e.blockKind === 'auth' ? { blockedUntil: e.blockedUntil, blockKind: e.blockKind, blockReason: e.blockReason } : { blockedUntil: 0, blockKind: undefined, blockReason: undefined };
  let out: QuotaEntry = { ...e, ...keep, fails: 0, lastOkAt: now, remTokens: hints.remTokens, remRequests: hints.remRequests, remAt: now };
  if (hints.remRequests !== undefined && hints.remRequests <= 0) {
    out = { ...out, blockedUntil: now + Math.min(hints.resetMs ?? Number.MAX_SAFE_INTEGER, nextResetMs(now, def.resetTz) - now), blockKind: 'quota', blockReason: 'requêtes du jour épuisées (annoncé par le fournisseur)' };
  } else if (hints.remTokens !== undefined && hints.remTokens <= 0 && hints.resetMs) {
    out = { ...out, blockedUntil: now + Math.min(hints.resetMs, 15 * 60_000), blockKind: 'rate', blockReason: 'jetons de la minute épuisés' };
  }
  return out;
}
