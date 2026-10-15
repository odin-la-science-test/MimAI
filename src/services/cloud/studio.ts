/* MiMai — création d'images et de voix (côté application) : fichiers, lecture du son, branchement sur le moteur en ligne.
   Tout passe par les clés déjà connectées dans « IA en ligne gratuite » (mêmes limites suivies, même bascule). */
import * as FileSystem from 'expo-file-system/legacy';
import { cloudEngine } from './index';
import { genImage, genSpeech, genDocText, videoProviders, CLOUD_VOICES, isCloudVoice } from './media';
import type { Intent, Media } from './media';
import type { ProviderId } from './providers';
import { cleanForSpeech, chunkForSpeech, setCloudSpeaker } from '../speak';
import { trail } from '../crashlog';

const DIR = () => (FileSystem.documentDirectory || '') + 'media/';
const ext = (mime: string) => (/png/.test(mime) ? 'png' : /webp/.test(mime) ? 'webp' : /jpe?g/.test(mime) ? 'jpg' : /wav/.test(mime) ? 'wav' : /mpe?g|mp3/.test(mime) ? 'mp3' : 'bin');

async function save(m: Media, prefix: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(DIR(), { intermediates: true }).catch(() => { /* existe déjà */ });
  const uri = DIR() + prefix + '-' + Date.now() + '.' + ext(m.mime);
  await FileSystem.writeAsStringAsync(uri, m.base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

/* ───────── lecture du son ───────── */
type Player = { play(): void; pause(): void; remove(): void; addListener(ev: string, cb: (s: { didJustFinish?: boolean }) => void): { remove(): void } };
let player: Player | null = null;
let finish: (() => void) | null = null;   /* rend la main à celui qui attend la fin de la lecture */
let speakId = 0;
function stopPlayer() {
  try { player?.pause(); player?.remove(); } catch { /* déjà arrêté */ }
  player = null;
  const f = finish; finish = null; f?.();
}
/* arrêt demandé (nouvelle lecture, bouton stop) : la lecture en ligne en cours s'interrompt aussi */
export function stopCloudAudio() { speakId++; stopPlayer(); }

/* joue un fichier et rend la main à la fin de la lecture */
export function playFile(uri: string): Promise<void> {
  stopPlayer();
  return new Promise<void>(resolve => {
    const timer = setTimeout(() => stopPlayer(), 5 * 60_000);   /* garde-fou */
    finish = () => { clearTimeout(timer); resolve(); };
    try {
      const A = require('expo-audio') as { createAudioPlayer(src: string): Player };
      const p = A.createAudioPlayer(uri);
      player = p;
      p.addListener('playbackStatusUpdate', s => { if (s.didJustFinish && player === p) stopPlayer(); });
      p.play();
    } catch (e) { trail('lecture audio impossible : ' + (e instanceof Error ? e.message : String(e)).slice(0, 80)); stopPlayer(); }
  });
}

/* ───────── voix en ligne ───────── */
function voiceParts(voiceId: string | null): { prefer?: ProviderId; name: string } {
  const v = CLOUD_VOICES.find(x => x.id === voiceId);
  return v ? { prefer: v.provider, name: v.name } : { name: 'Kore' };
}

export function connectedCloudVoices() {
  const e = cloudEngine();
  if (!e) return [];
  return CLOUD_VOICES.filter(v => e.hasProvider(v.provider));
}

export async function synthesize(text: string, voiceId: string | null): Promise<{ uri: string; provider: string } | null> {
  const e = cloudEngine();
  if (!e || !e.mediaAvailable('tts')) return null;
  const { prefer, name } = voiceParts(voiceId);
  const r = await e.media('tts', (id, key, account, post) => genSpeech(id, key, account, text, name, post), prefer);
  if (!r) return null;
  return { uri: await save(r.media, 'voix'), provider: r.provider };
}

/* lecture d'une réponse avec une voix en ligne ; faux si impossible (l'appelant retombe sur la voix du téléphone) */
async function cloudSpeak(text: string, voiceId: string, onEnd?: () => void): Promise<boolean> {
  const clean = cleanForSpeech(text);
  if (!clean) { onEnd?.(); return true; }
  const parts = chunkForSpeech(clean, 700).slice(0, 4);
  const mine = ++speakId;
  try {
    for (let i = 0; i < parts.length; i++) {
      if (mine !== speakId) return true;
      const s = await synthesize(parts[i], voiceId);
      if (!s) { if (i === 0) return false; break; }
      if (mine !== speakId) return true;
      await playFile(s.uri);
      void FileSystem.deleteAsync(s.uri, { idempotent: true }).catch(() => { /* effacé plus tard */ });
    }
  } catch { if (!parts.length) return false; }
  onEnd?.();
  return true;
}
setCloudSpeaker(cloudSpeak, stopCloudAudio);

/* PDF illisible en local : lu par Gemini (si connecté et si l'utilisateur a activé l'IA en ligne) ; null sinon */
export async function extractDocViaCloud(uri: string, mime: string): Promise<string | null> {
  const e = cloudEngine();
  if (!e || !e.mediaAvailable('doc')) return null;
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const r = await e.media('doc', (id, key, account, post) => genDocText(id, key, account, b64, mime, post));
    return r?.media.text || null;
  } catch (err) {
    trail('lecture de document en ligne : erreur ignorée (' + (err instanceof Error ? err.message : String(err)).slice(0, 80) + ')');
    return null;
  }
}

/* ───────── « génère une image / un vocal / une vidéo » ───────── */
export interface MediaResult { text: string; image?: string | null; ok: boolean; model: string }

export async function runIntent(it: Intent, voiceId: string | null): Promise<MediaResult> {
  const e = cloudEngine();
  const none = (what: string): MediaResult => ({ ok: false, model: 'En ligne', text: 'Pour ' + what + ', activez « IA en ligne gratuite » (menu) et connectez Cloudflare Workers AI ou Google Gemini.' });
  if (it.kind === 'video') {
    if (!videoProviders().length) return { ok: false, model: 'En ligne', text: 'Aucun fournisseur gratuit connecté ne sait générer de vidéo pour l’instant, donc je préfère ne pas faire semblant. Je peux en revanche créer l’image de départ (« génère une image de… ») ou un vocal.' };
  }
  if (!e || !e.mediaAvailable(it.kind === 'image' ? 'image' : 'tts')) return none(it.kind === 'image' ? 'créer des images' : 'créer un vocal');
  try {
    if (it.kind === 'image') {
      const r = await e.media('image', (id, key, account, post) => genImage(id, key, account, it.prompt, post));
      if (!r) return { ok: false, model: 'En ligne', text: 'Je n’ai pas pu créer l’image : les fournisseurs connectés ont atteint leur limite ou ne répondent pas. Réessayez plus tard.' };
      const uri = await save(r.media, 'image');
      return { ok: true, model: 'En ligne · ' + r.provider, image: uri, text: 'Voici l’image : « ' + it.prompt.slice(0, 120) + ' ».' };
    }
    const s = await synthesize(it.prompt.slice(0, 700), voiceId);
    if (!s) return { ok: false, model: 'En ligne', text: 'Je n’ai pas pu créer le vocal : les fournisseurs connectés ont atteint leur limite ou ne répondent pas. Réessayez plus tard.' };
    void playFile(s.uri);
    return { ok: true, model: 'En ligne · ' + s.provider, text: '🔊 ' + it.prompt.slice(0, 700) };
  } catch (err) {
    trail('génération média : erreur ignorée (' + (err instanceof Error ? err.message : String(err)).slice(0, 80) + ')');
    return { ok: false, model: 'En ligne', text: 'La création a échoué. Réessayez dans un instant.' };
  }
}

export { isCloudVoice };
