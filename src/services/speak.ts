/* MiMai — réponse vocale (synthèse vocale d'Android, via expo-speech).
   MiMai n'envoie jamais le texte sur Internet : la lecture est confiée au moteur de synthèse vocale du
   téléphone, avec les voix installées. Réserve honnête : si l'utilisateur choisit dans Android une voix
   « réseau », c'est ce moteur système (et non MiMai) qui peut utiliser Internet.
   Module natif absent d'Expo Go → speakAvailable() est faux et l'interface le dit. */

type SpeechModule = {
  getAvailableVoicesAsync?(): Promise<{ identifier: string; name: string; language: string; quality?: string }[]>;
  speak(text: string, o?: Record<string, unknown>): void;
  stop(): Promise<void>;
  isSpeakingAsync(): Promise<boolean>;
};

let S: SpeechModule | null = null;
try { S = require('expo-speech') as SpeechModule; } catch { S = null; }

export const speakAvailable = (): boolean => !!S;

/* texte lisible à voix haute : sans markdown, liens, emojis ni symboles de mise en forme */
export function cleanForSpeech(raw: string): string {
  let t = String(raw || '');
  t = t.replace(/```[\s\S]*?```/g, ' (extrait de code) ');       // blocs de code : on ne les lit pas
  t = t.replace(/`([^`]*)`/g, '$1');
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');                  // images
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');                // [texte](lien) -> texte
  t = t.replace(/https?:\/\/\S+/g, ' lien ');
  t = t.replace(/^#{1,6}\s*/gm, '');                            // titres
  t = t.replace(/^\s*[-*•]\s+/gm, '');                          // puces
  t = t.replace(/\*\*|__|\*|_{1,2}/g, '');                      // gras / italique
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ''); // emojis
  t = t.replace(/[<>|~^]/g, ' ');
  t = t.trim();
  t = t.replace(/\s*\n+\s*/g, '. ').replace(/\.\s*\./g, '.');   // sauts de ligne -> pauses
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

/* découpe en morceaux < 3 500 caractères (limite du moteur Android) sur des fins de phrase */
export function chunkForSpeech(text: string, max = 3500): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    /* on cherche une fin de phrase dans les `max` premiers caractères (index <= max - 1, donc morceau <= max) */
    let cut = Math.max(rest.lastIndexOf('. ', max - 1), rest.lastIndexOf('! ', max - 1), rest.lastIndexOf('? ', max - 1));
    if (cut < max * 0.4) cut = rest.lastIndexOf(' ', max - 1);
    if (cut <= 0) { out.push(rest.slice(0, max)); rest = rest.slice(max); continue; } // aucun point de coupe : coupe nette
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/* ───────── choix de la voix ───────── */
export interface VoicePrefs { id?: string | null; rate: number; pitch: number }
export interface VoiceInfo { id: string; label: string; lang: string; good: boolean }
export const DEFAULT_VOICE: VoicePrefs = { id: null, rate: 1, pitch: 1 };
/* styles prêts à l'emploi : réglages de vitesse et de ton appliqués à la voix choisie */
export const VOICE_STYLES: { id: string; label: string; rate: number; pitch: number }[] = [
  { id: 'naturelle', label: 'Naturelle', rate: 1, pitch: 1 },
  { id: 'posee', label: 'Posée', rate: 0.85, pitch: 0.95 },
  { id: 'grave', label: 'Grave', rate: 0.95, pitch: 0.75 },
  { id: 'aigue', label: 'Aiguë', rate: 1.05, pitch: 1.3 },
  { id: 'vive', label: 'Vive', rate: 1.25, pitch: 1.05 },
];
let prefs: VoicePrefs = { ...DEFAULT_VOICE };
export const setVoicePrefs = (p: Partial<VoicePrefs> | undefined) => {
  const n = (v: unknown, d: number) => (typeof v === 'number' && v >= 0.5 && v <= 2 ? v : d);
  prefs = { id: p?.id || null, rate: n(p?.rate, 1), pitch: n(p?.pitch, 1) };
};

/* voix françaises installées, les meilleures d'abord ; noms lisibles (« Voix 1 · France · haute qualité ») */
export function pickVoices(list: { identifier: string; name?: string; language?: string; quality?: string }[]): VoiceInfo[] {
  const fr = (list || []).filter(v => v && v.identifier && /^fr([-_]|$)/i.test(v.language || ''));
  const score = (v: { quality?: string }) => (/enhanced|high/i.test(v.quality || '') ? 0 : 1);
  const home = (v: { language?: string }) => (/^fr([-_]FR)?$/i.test(v.language || '') ? 0 : 1);
  fr.sort((a, b) => score(a) - score(b) || home(a) - home(b) || a.identifier.localeCompare(b.identifier));
  const region = (l: string) => (/[-_]FR$/i.test(l) || /^fr$/i.test(l) ? 'France' : /[-_]CA$/i.test(l) ? 'Canada' : /[-_]BE$/i.test(l) ? 'Belgique' : /[-_]CH$/i.test(l) ? 'Suisse' : l);
  return fr.map((v, i) => ({ id: v.identifier, lang: v.language || 'fr', good: score(v) === 0, label: 'Voix ' + (i + 1) + ' · ' + region(v.language || 'fr') + (score(v) === 0 ? ' · haute qualité' : '') }));
}
export async function listVoices(): Promise<VoiceInfo[]> {
  try { return S?.getAvailableVoicesAsync ? pickVoices(await S.getAvailableVoicesAsync()) : []; } catch { return []; }
}

let token = 0;

/* lit le texte ; onEnd est appelé à la fin ou à l'arrêt. Retourne false si impossible. */
export function speak(text: string, onEnd?: () => void): boolean {
  if (!S) return false;
  const clean = cleanForSpeech(text);
  if (!clean) { onEnd?.(); return false; }
  const mine = ++token;
  void S.stop().catch(() => { /* rien à arrêter */ });
  const parts = chunkForSpeech(clean);
  const next = (i: number) => {
    if (mine !== token) return;                       // une autre lecture a pris le relais
    if (i >= parts.length) { onEnd?.(); return; }
    try {
      S!.speak(parts[i], {
        language: 'fr-FR', pitch: prefs.pitch, rate: prefs.rate, ...(prefs.id ? { voice: prefs.id } : {}),
        onDone: () => next(i + 1),
        onStopped: () => { if (mine === token) onEnd?.(); },
        onError: () => { if (mine === token) onEnd?.(); },
      });
    } catch { onEnd?.(); }
  };
  next(0);
  return true;
}

export function stopSpeaking(): void {
  token++;
  try { void S?.stop(); } catch { /* indisponible */ }
}
