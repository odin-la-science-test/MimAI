/* MiMai — fournisseurs d'IA en ligne GRATUITES (module pur, testable sous Node : scripts/cloud.test.cjs).
   Tous parlent le même dialecte « OpenAI » (POST /chat/completions, flux SSE) : un seul client suffit.
   Aucune clé n'est livrée avec l'app : l'utilisateur colle la sienne (gratuite) ; elle reste dans le coffre du téléphone.
   Les limites gratuites ci-dessous viennent du tableau fourni par le propriétaire du projet ; elles changent : le suivi réel
   se fait aussi à partir des réponses des fournisseurs (en-têtes de limite, erreurs 429), jamais sur ces seuls chiffres. */

export type ProviderId = 'cerebras' | 'groq' | 'gemini' | 'sambanova' | 'openrouter' | 'mistral' | 'cloudflare';
export type Tier = 'fast' | 'balanced' | 'strong';

export interface ProviderDef {
  id: ProviderId;
  name: string;
  /* URL de base OpenAI-compatible ; « {account} » est remplacé par l'identifiant de compte (Cloudflare) */
  base: string;
  needsAccount?: boolean;
  keyUrl: string;
  keyHint: string;
  /* formes reconnues dans le presse-papiers : permet de deviner le fournisseur d'une clé collée */
  keyPattern?: RegExp;
  /* limites gratuites : jetons par jour, comptés par modèle (« model ») ou pour tout le compte (« provider ») ; null = non précisé */
  dailyTokens: number | null;
  scope: 'model' | 'provider';
  /* Cloudflare compte en « neurones » (≈ coût de calcul), pas en jetons */
  dailyNeurons?: number;
  /* fuseau du remplacement quotidien des compteurs */
  resetTz: 'UTC' | 'America/Los_Angeles';
  /* où lire la liste des modèles : « openai » (GET /models), « static » (liste fournie) */
  models: 'openai' | 'static';
  staticModels?: string[];
  /* préfixe à retirer des identifiants de modèles (Gemini : « models/ ») */
  idPrefix?: string;
  /* le fournisseur accepte l'option stream_options.include_usage (compte exact des jetons en fin de flux) */
  streamUsage: boolean;
  note: string;
  privacy: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'cerebras', name: 'Cerebras', base: 'https://api.cerebras.ai/v1', keyUrl: 'https://cloud.cerebras.ai/',
    keyHint: 'Créez un compte gratuit, puis « API Keys ».', keyPattern: /^csk-[A-Za-z0-9]{20,}$/,
    dailyTokens: 1_000_000, scope: 'provider', resetTz: 'UTC', models: 'openai', streamUsage: true,
    note: '1 000 000 de jetons par jour (crédits d’essai limités). Très rapide.',
    privacy: 'Vos messages sont envoyés à Cerebras. Consultez leurs conditions pour la conservation des données.',
  },
  {
    id: 'groq', name: 'Groq', base: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys',
    keyHint: 'Compte gratuit, puis « Create API Key ».', keyPattern: /^gsk_[A-Za-z0-9]{20,}$/,
    dailyTokens: 200_000, scope: 'model', resetTz: 'UTC', models: 'openai', streamUsage: true,
    note: '200 000 jetons par jour et par modèle. Très rapide.',
    privacy: 'Vos messages sont envoyés à Groq. Consultez leurs conditions pour la conservation des données.',
  },
  {
    id: 'gemini', name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'Compte Google, puis « Get API key » dans AI Studio.', keyPattern: /^AIza[A-Za-z0-9_-]{30,}$/,
    dailyTokens: null, scope: 'model', resetTz: 'America/Los_Angeles', models: 'openai', idPrefix: 'models/', streamUsage: true,
    note: 'Limites variables selon le modèle (le suivi se fait sur les réponses de Google). Comprend aussi les images.',
    privacy: 'Vos messages sont envoyés à Google. Au niveau gratuit, Google peut les utiliser pour améliorer ses produits : vérifiez leurs conditions.',
  },
  {
    id: 'sambanova', name: 'SambaNova', base: 'https://api.sambanova.ai/v1', keyUrl: 'https://cloud.sambanova.ai/apis',
    keyHint: 'Compte gratuit, puis « API keys ».',
    dailyTokens: 200_000, scope: 'model', resetTz: 'UTC', models: 'openai', streamUsage: true,
    note: '200 000 jetons par jour et par modèle (quota qui dépend du modèle).',
    privacy: 'Vos messages sont envoyés à SambaNova. Consultez leurs conditions pour la conservation des données.',
  },
  {
    id: 'openrouter', name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys',
    keyHint: 'Compte gratuit, puis « Create Key ». Seuls les modèles « :free » sont utilisés.', keyPattern: /^sk-or-v1-[A-Za-z0-9]{20,}$/,
    dailyTokens: null, scope: 'provider', resetTz: 'UTC', models: 'openai', streamUsage: true,
    note: 'Limite non précisée (le suivi se fait sur les réponses). Seuls les modèles gratuits (« :free ») sont choisis.',
    privacy: 'Vos messages passent par OpenRouter puis par le fournisseur du modèle choisi. Les modèles gratuits peuvent journaliser les échanges.',
  },
  {
    id: 'mistral', name: 'Mistral AI', base: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys',
    keyHint: 'Compte gratuit (offre « Experiment »), puis « Create new key ».',
    dailyTokens: null, scope: 'provider', resetTz: 'UTC', models: 'openai', streamUsage: false,
    note: 'Limite non précisée (le suivi se fait sur les réponses).',
    privacy: 'Vos messages sont envoyés à Mistral AI. À l’offre gratuite, ils peuvent servir à entraîner leurs modèles : vérifiez leurs conditions.',
  },
  {
    id: 'cloudflare', name: 'Cloudflare Workers AI', base: 'https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1', needsAccount: true,
    keyUrl: 'https://dash.cloudflare.com/profile/api-tokens', keyHint: 'Il faut un jeton d’API (Workers AI) ET l’identifiant de votre compte Cloudflare.',
    dailyTokens: null, dailyNeurons: 10_000, scope: 'provider', resetTz: 'UTC', models: 'static', streamUsage: false,
    staticModels: ['@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/google/gemma-3-12b-it', '@cf/qwen/qwq-32b'],
    note: '10 000 « neurones » par jour (unité de calcul de Cloudflare : le suivi est une estimation).',
    privacy: 'Vos messages sont envoyés à Cloudflare. Consultez leurs conditions pour la conservation des données.',
  },
];

export const PROVIDER_BY_ID: Record<string, ProviderDef> = Object.fromEntries(PROVIDERS.map(p => [p.id, p]));

/* devine le fournisseur d'une clé collée (sinon null : l'utilisateur choisit) */
export function detectProvider(key: string): ProviderId | null {
  const k = (key || '').trim();
  for (const p of PROVIDERS) if (p.keyPattern && p.keyPattern.test(k)) return p.id;
  return null;
}

export const apiBase = (def: ProviderDef, account?: string): string => def.base.replace('{account}', encodeURIComponent(account || ''));

/* ───────── modèles : découverte automatique et classement ───────── */
export interface ModelInfo { id: string; tier: Tier; vision: boolean; reasoning: boolean; free: boolean }

/* modèles qui ne répondent pas à une discussion (transcription, voix, images, sécurité, vecteurs…) */
const NOT_CHAT = /(embed|whisper|tts|speech|guard|moderation|rerank|image|imagen|veo|audio|orpheus|playai|dall|transcri|ocr|vector|bge-|aqa|learnlm|robotics|computer-use|live|native-audio|-tts)/i;
const FAST = /(\b|[-_])(1b|3b|7b|8b|9b|instant|mini|nano|lite|flash-lite|small|tiny|haiku|e2b|e4b)(\b|[-_:])/i;
const STRONG = /(70b|72b|90b|120b|123b|235b|253b|405b|480b|671b|maverick|large|ultra|opus|\bpro\b|r1|gpt-oss-120b|gemini-2\.5-pro|-32b|\b32b\b|thinking)/i;
const REASON = /(r1|thinking|reason|qwq|gpt-oss|o1|o3|magistral|deepseek-r|-pro\b)/i;
const VISION = /(vision|\bvl\b|-vl-|pixtral|llava|scout|maverick|gemini|gemma-3|llama-4|vlm|multimodal|omni)/i;

export function classifyModel(id: string, providerId: ProviderId, raw?: { pricing?: { prompt?: string; completion?: string } }): ModelInfo | null {
  if (NOT_CHAT.test(id)) return null;
  const strong = STRONG.test(id);
  const fast = FAST.test(id);
  const tier: Tier = strong && !fast ? 'strong' : fast && !strong ? 'fast' : 'balanced';
  const priced = raw?.pricing;
  const free = providerId === 'openrouter' ? (id.endsWith(':free') || (!!priced && Number(priced.prompt) === 0 && Number(priced.completion) === 0)) : true;
  return { id, tier, vision: providerId === 'gemini' ? true : VISION.test(id), reasoning: REASON.test(id), free };
}

/* garde les modèles utilisables gratuitement, sans doublon, du plus utile au moins utile ; limite le nombre par fournisseur */
export function pickModels(providerId: ProviderId, rawList: { id: string; pricing?: { prompt?: string; completion?: string } }[], idPrefix?: string, max = 8): ModelInfo[] {
  const seen = new Set<string>();
  const out: ModelInfo[] = [];
  for (const r of rawList) {
    let id = String(r.id || '');
    if (idPrefix && id.startsWith(idPrefix)) id = id.slice(idPrefix.length);
    if (!id || seen.has(id)) continue;
    const m = classifyModel(id, providerId, r);
    if (!m || !m.free) continue;
    /* anciennes versions / aperçus / expérimentaux : écartés tant qu'il reste mieux */
    seen.add(id);
    out.push(m);
  }
  const rank = (m: ModelInfo) => (/preview|exp|legacy|deprecated|-0\d{3}$/i.test(m.id) ? 1 : 0);
  out.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  /* on garde un mélange : des rapides, des équilibrés, des forts */
  const byTier: Record<Tier, ModelInfo[]> = { fast: [], balanced: [], strong: [] };
  out.forEach(m => byTier[m.tier].push(m));
  const mix: ModelInfo[] = [];
  const order: Tier[] = ['strong', 'fast', 'balanced'];
  for (let i = 0; mix.length < max && i < 20; i++) for (const t of order) { const m = byTier[t][i]; if (m && mix.length < max) mix.push(m); }
  return mix;
}
