/* MiMai — génération d'IMAGES et de VOIX par les fournisseurs gratuits déjà connectés (module pur, testable sous Node :
   le réseau est injecté). Fournisseurs : Cloudflare Workers AI (Flux-1 schnell, MeloTTS) et Google Gemini (image, voix).
   Vidéo : aucun fournisseur gratuit connu ne la propose aujourd'hui ; videoProviders() reste vide tant que ce n'est pas le cas,
   et l'app le dit franchement au lieu de simuler. */
import type { ProviderId } from './providers.ts';
import { classifyFailure } from './quota.ts';
import { CloudError } from './router.ts';

export type MediaKind = 'image' | 'tts';
export interface Post { (url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<{ status: number; headers: Record<string, string>; text: string }> }
export interface Media { base64: string; mime: string }

export const MEDIA_PROVIDERS: Record<MediaKind, ProviderId[]> = { image: ['cloudflare', 'gemini'], tts: ['cloudflare', 'gemini'] };
export const videoProviders = (): ProviderId[] => [];

/* voix proposées en ligne : identifiant stable « fournisseur:voix » */
export interface CloudVoice { id: string; provider: ProviderId; name: string; label: string }
const GEM = ['Kore', 'Puck', 'Zephyr', 'Charon', 'Aoede', 'Fenrir', 'Leda', 'Orus', 'Callirrhoe', 'Enceladus', 'Algieba', 'Sulafat'];
export const CLOUD_VOICES: CloudVoice[] = [
  { id: 'cloudflare:FR', provider: 'cloudflare', name: 'FR', label: 'Cloudflare · Français' },
  ...GEM.map(n => ({ id: 'gemini:' + n, provider: 'gemini' as ProviderId, name: n, label: 'Gemini · ' + n })),
];
export const isCloudVoice = (id: string | null | undefined): boolean => !!id && CLOUD_VOICES.some(v => v.id === id);

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const CF = (account: string) => 'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(account) + '/ai/run/';
const IMAGE_MODEL = { cloudflare: '@cf/black-forest-labs/flux-1-schnell', gemini: 'gemini-2.5-flash-image' };
const TTS_MODEL = { cloudflare: '@cf/myshell-ai/melotts', gemini: 'gemini-2.5-flash-preview-tts' };

/* ───────── base64 / WAV (Hermes fournit atob et btoa) ───────── */
export function pcmToWavBase64(pcmB64: string, rate = 24000): string {
  const bin = atob(pcmB64);
  const n = bin.length;
  const h = new Uint8Array(44);
  const dv = new DataView(h.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) h[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n, true);
  let head = '';
  for (let i = 0; i < 44; i++) head += String.fromCharCode(h[i]);
  return btoa(head + bin);
}

const fail = (status: number, text: string, headers: Record<string, string>) => new CloudError(classifyFailure(status, text, headers), headers);
async function call(post: Post, url: string, headers: Record<string, string>, body: unknown, timeoutMs: number) {
  let r;
  try { r = await post(url, headers, body, timeoutMs); }
  catch (e) { throw new CloudError({ kind: 'server', reason: 'réseau : ' + String((e as Error)?.message || e).slice(0, 100) }); }
  if (r.status < 200 || r.status >= 300) throw fail(r.status, r.text, r.headers);
  try { return { json: JSON.parse(r.text) as Record<string, unknown>, headers: r.headers }; }
  catch { throw new CloudError({ kind: 'server', reason: 'réponse illisible' }, r.headers); }
}

interface GemPart { inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string } }
const gemParts = (j: Record<string, unknown>): GemPart[] => {
  const c = (j.candidates as { content?: { parts?: GemPart[] } }[] | undefined)?.[0];
  return c?.content?.parts || [];
};

export async function genImage(id: ProviderId, key: string, account: string | undefined, prompt: string, post: Post): Promise<Media> {
  if (id === 'cloudflare') {
    if (!account) throw new CloudError({ kind: 'auth', reason: 'identifiant de compte absent' });
    const { json } = await call(post, CF(account) + IMAGE_MODEL.cloudflare, { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, { prompt, steps: 6 }, 60000);
    const b64 = (json.result as { image?: string } | undefined)?.image;
    if (!b64) throw new CloudError({ kind: 'server', reason: 'aucune image reçue' });
    return { base64: b64, mime: 'image/jpeg' };
  }
  if (id === 'gemini') {
    const { json } = await call(post, GEMINI + '/models/' + IMAGE_MODEL.gemini + ':generateContent', { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, { contents: [{ parts: [{ text: prompt }] }] }, 60000);
    for (const p of gemParts(json)) {
      const d = p.inlineData?.data || p.inline_data?.data;
      if (d) return { base64: d, mime: p.inlineData?.mimeType || p.inline_data?.mime_type || 'image/png' };
    }
    throw new CloudError({ kind: 'model', reason: 'aucune image reçue (modèle d’image non disponible sur ce compte)' });
  }
  throw new CloudError({ kind: 'bad_request', reason: 'génération d’image non prise en charge' });
}

export async function genSpeech(id: ProviderId, key: string, account: string | undefined, text: string, voice: string, post: Post): Promise<Media> {
  if (id === 'cloudflare') {
    if (!account) throw new CloudError({ kind: 'auth', reason: 'identifiant de compte absent' });
    const { json } = await call(post, CF(account) + TTS_MODEL.cloudflare, { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, { prompt: text, lang: 'fr' }, 40000);
    const r = json.result as { audio?: string } | undefined;
    if (!r?.audio) throw new CloudError({ kind: 'server', reason: 'aucun son reçu' });
    return { base64: r.audio, mime: 'audio/mpeg' };
  }
  if (id === 'gemini') {
    const body = { contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Kore' } } } } };
    const { json } = await call(post, GEMINI + '/models/' + TTS_MODEL.gemini + ':generateContent', { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body, 40000);
    for (const p of gemParts(json)) {
      const d = p.inlineData?.data || p.inline_data?.data;
      if (d) {
        const mime = p.inlineData?.mimeType || p.inline_data?.mime_type || 'audio/L16;rate=24000';
        const rate = Number(/rate=(\d+)/.exec(mime)?.[1]) || 24000;
        return { base64: pcmToWavBase64(d, rate), mime: 'audio/wav' };
      }
    }
    throw new CloudError({ kind: 'model', reason: 'aucun son reçu' });
  }
  throw new CloudError({ kind: 'bad_request', reason: 'voix non prise en charge' });
}

/* ───────── « génère une image de… », « lis-moi… à voix haute », « fais une vidéo de… » ───────── */
export interface Intent { kind: 'image' | 'voice' | 'video'; prompt: string }
export function detectIntent(raw: string): Intent | null {
  const t = String(raw || '').trim();
  if (!t || t.length > 600) return null;
  const clean = (s: string) => s.replace(/^[\s:,\-–]+/, '').replace(/^(d['’]\s*|de\s+|du\s+|des\s+|d['’]une?\s+|une?\s+)/i, '').trim();
  let m = /^(?:peux-tu |pouvez-vous |tu peux |s'il te plaît |stp )?(?:g[ée]n[èe]re|cr[ée]e|dessine|fais(?:-moi)?|produis|imagine)\s+(?:moi\s+)?(?:une?\s+)?(?:image|illustration|photo|dessin|logo|affiche)\s*(?:de |d['’]|du |des |:)?\s*([\s\S]*)$/i.exec(t);
  if (m && m[1].trim()) return { kind: 'image', prompt: clean(m[1]) || m[1].trim() };
  m = /^(?:peux-tu |pouvez-vous |tu peux |s'il te plaît |stp )?(?:g[ée]n[èe]re|cr[ée]e|fais(?:-moi)?|produis)\s+(?:moi\s+)?(?:une?\s+)?(?:vid[ée]o|clip|animation)\s*(?:de |d['’]|du |des |:)?\s*([\s\S]*)$/i.exec(t);
  if (m && m[1].trim()) return { kind: 'video', prompt: clean(m[1]) || m[1].trim() };
  m = /^(?:g[ée]n[èe]re|cr[ée]e|fais|produis|enregistre)\s+(?:moi\s+)?(?:un\s+)?(?:vocal|message vocal|audio|fichier audio|enregistrement)\s*(?:de |d['’]|du |des |:|disant |qui dit )?\s*([\s\S]*)$/i.exec(t);
  if (m && m[1].trim()) return { kind: 'voice', prompt: m[1].replace(/^["«»“”\s]+|["«»“”\s]+$/g, '').trim() };
  return null;
}
