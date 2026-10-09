/* MiMai — commande vocale.
   Reconnaissance vocale 100 % SUR L'APPAREIL (Android 13+ avec le pack de langue hors ligne).
   Si le téléphone ne sait pas le faire hors ligne, on REFUSE au lieu de basculer sur la
   reconnaissance réseau de Google : l'audio ne doit jamais quitter l'appareil (README §2).
   Le micro n'est ouvert qu'après un appui explicite, jamais en continu. Module natif :
   absent d'Expo Go → voiceAvailable() est faux et l'interface reste honnête. */

type Sub = { remove: () => void };
type Recognizer = {
  start(o: Record<string, unknown>): void;
  stop(): void;
  abort(): void;
  requestPermissionsAsync(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  supportsOnDeviceRecognition(): boolean;
  isRecognitionAvailable(): boolean;
  addListener(name: string, fn: (e: never) => void): Sub;
};

let M: Recognizer | null = null;
try {
  M = (require('expo-speech-recognition') as { ExpoSpeechRecognitionModule: Recognizer }).ExpoSpeechRecognitionModule;
} catch { M = null; }

export const voiceAvailable = (): boolean => !!M;

export type VoiceFailure = 'unavailable' | 'permission' | 'offline-unsupported' | 'no-speech' | 'language' | 'busy' | 'error';

/* message lisible pour chaque échec (jamais d'erreur technique brute à l'écran) */
export function describeVoiceFailure(f: VoiceFailure): string {
  switch (f) {
    case 'unavailable': return 'La commande vocale demande la version installée de MiMai.';
    case 'permission': return 'Micro refusé : autorisez-le dans Réglages Android → Applications → MiMai → Autorisations.';
    case 'offline-unsupported': return 'Ce téléphone ne sait pas reconnaître la voix hors ligne (Android 13 ou plus requis). Rien n’est envoyé sur Internet : la commande vocale reste désactivée.';
    case 'language': return 'Le pack de langue français hors ligne manque. Installez-le dans Réglages Android → Système → Langues → Saisie vocale, puis réessayez.';
    case 'no-speech': return 'Je n’ai rien entendu. Réessayez en parlant plus près du micro.';
    case 'busy': return 'La reconnaissance vocale est déjà en cours.';
    default: return 'La reconnaissance vocale a échoué. Réessayez.';
  }
}

export interface Listening { stop: () => void; cancel: () => void }
export interface ListenHandlers {
  onPartial: (text: string) => void;            // texte provisoire pendant que l'on parle
  onFinal: (text: string) => void;              // phrase terminée (peut être vide)
  onEnd: () => void;                            // session close (succès ou échec)
  onFail: (reason: VoiceFailure) => void;
}

let active = false;

/* démarre l'écoute ; renvoie null (et appelle onFail) si impossible */
export async function listen(h: ListenHandlers, lang = 'fr-FR'): Promise<Listening | null> {
  if (!M) { h.onFail('unavailable'); return null; }
  if (active) { h.onFail('busy'); return null; }
  let granted = false;
  try { granted = !!(await M.requestPermissionsAsync()).granted; } catch { granted = false; }
  if (!granted) { h.onFail('permission'); return null; }
  /* garde-fou vie privée : pas de reconnaissance par le réseau */
  if (!M.supportsOnDeviceRecognition()) { h.onFail('offline-unsupported'); return null; }

  const subs: Sub[] = [];
  let lastText = '';
  let gotFinal = false;
  let failed = false;
  const cleanup = () => { subs.splice(0).forEach(s => { try { s.remove(); } catch { /* déjà retiré */ } }); active = false; };

  subs.push(M.addListener('result', ((ev: { results?: { transcript?: string }[]; isFinal?: boolean }) => {
    const text = (ev.results?.[0]?.transcript || '').trim();
    if (text) lastText = text;
    if (ev.isFinal) { gotFinal = true; h.onFinal(text || lastText); } else if (text) h.onPartial(text);
  }) as never));
  subs.push(M.addListener('error', ((ev: { error?: string }) => {
    if (failed) return;
    const code = ev.error || '';
    if (code === 'aborted') return;                       // annulation volontaire : pas une erreur
    failed = true;
    h.onFail(code === 'no-speech' || code === 'speech-timeout' ? 'no-speech'
      : code === 'language-not-supported' || code === 'service-not-allowed' || code === 'network' ? 'language'
      : code === 'not-allowed' ? 'permission' : 'error');
  }) as never));
  subs.push(M.addListener('end', (() => {
    if (!gotFinal && !failed && lastText) { gotFinal = true; h.onFinal(lastText); } // certains moteurs ne marquent pas le dernier résultat
    cleanup();
    h.onEnd();
  }) as never));

  active = true;
  try {
    M.start({ lang, interimResults: true, continuous: false, requiresOnDeviceRecognition: true, addsPunctuation: true, maxAlternatives: 1 });
  } catch {
    cleanup();
    h.onFail('error');
    h.onEnd();
    return null;
  }
  return {
    stop: () => { try { M?.stop(); } catch { /* déjà arrêté */ } },
    cancel: () => { try { M?.abort(); } catch { /* déjà arrêté */ } },
  };
}
