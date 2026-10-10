/* Bulle assistant « Mìmir » par-dessus les autres applis.
   Le module natif MimirOverlay n'existe que dans la version installée
   (build de développement ou .aab) : en Expo Go, overlayAvailable() est faux
   et l'interface reste honnête sur la limite.
   Politique Google Play : SYSTEM_ALERT_WINDOW + service au premier plan sont des
   permissions sensibles. Le build de production peut donc être compilé SANS bulle
   (variable MIMAI_OVERLAY=0, voir plugins/withMimaiAndroid.js et docs/PLAY_STORE_CHECKLIST.md) :
   le drapeau extra.overlayEnabled, injecté à la compilation, masque alors toute la fonction. */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

/* drapeau de compilation : vrai par défaut (builds de développement) */
const enabledAtBuild = (Constants.expoConfig?.extra as { overlayEnabled?: boolean } | undefined)?.overlayEnabled !== false;

type NativeOverlay = {
  isGranted(): boolean | Promise<boolean>;
  requestPermission(): unknown;
  show(): boolean | Promise<boolean>;
  hide(): unknown;
  sha256File(path: string): Promise<string>;
  status(): OverlayStatus;
  chatText?(text: string, done: boolean): unknown;
  lastExit?(): ExitInfo[];
  chatState?(json: string): boolean;
  barState?(state: string, title: string, body: string, label: string, prog: number): boolean;
  barPlay?(id: string): boolean;
  chatInput?(text: string): boolean;
  chatMic?(on: boolean): boolean;
  setBar?(on: boolean): boolean;
  setPos?(pos: string): boolean;
  openNotifSettings?(promoted: boolean): boolean;
  trail?(text: string): boolean;
  readTrail?(): string;
  clearTrail?(): boolean;
  addListener?(name: string, cb: (e: any) => void): { remove(): void };
};

/* état technique de la barre (aucune donnée personnelle), pour l'écran de diagnostic */
export interface OverlayStatus {
  sdk: number; fabricant: string; modele: string; permission: boolean;
  serviceActif: boolean; dernierEvenement: string; encoche: string;
  notifications?: boolean; puceAutorisee?: boolean; etoile?: string;
}

let M: NativeOverlay | null = null;
if (Platform.OS === 'android' && enabledAtBuild) {
  try { M = require('expo-modules-core').requireNativeModule('MimirOverlay') as NativeOverlay; } catch { M = null; }
}

export const overlayAvailable = (): boolean => !!M;
/* faux quand la version a été compilée sans bulle (build Google Play) : la fonction n'existe pas du tout */
export const overlayIncluded = enabledAtBuild;

export async function overlayGranted(): Promise<boolean> {
  try { return M ? !!(await M.isGranted()) : false; } catch { return false; }
}

export function overlayRequest(): void {
  try { M?.requestPermission(); } catch { /* indisponible */ }
}

export async function overlayShow(bar?: boolean, pos?: 'below' | 'camera'): Promise<boolean> {
  try {
    if (M && pos !== undefined) M.setPos?.(pos);
    if (M && bar !== undefined) M.setBar?.(!!bar);   /* barre noire dessinée : facultative, la puce système est toujours là */
    return M ? !!(await M.show()) : false;
  } catch { return false; }
}

export function overlayStatus(): OverlayStatus | null {
  try { return M ? M.status() : null; } catch { return null; }
}

/* discussion flottante : la barre envoie les messages saisis (onChatSend), l'app répond par morceaux (chatText) */
export function overlayChatOn(onOpen: () => void, onSend: (text: string, image?: string) => void, onAction?: (type: string, arg: string) => void): () => void {
  try {
    const a = M?.addListener?.('onChatOpen', () => onOpen());
    const b = M?.addListener?.('onChatSend', (e: { text?: string; image?: string }) => { if (e?.text || e?.image) onSend(String(e.text ?? ''), e.image ? String(e.image) : undefined); });
    const c = M?.addListener?.('onChatAction', (e: { type?: string; arg?: string }) => { if (e?.type) onAction?.(String(e.type), String(e.arg ?? '')); });
    return () => { try { a?.remove(); b?.remove(); c?.remove(); } catch { /* déjà retiré */ } };
  } catch { return () => undefined; }
}
/* barre animée : état (repos, notif, ecoute, reflexion, activite) et animation de l'étoile (156 : voir assets/design) */
export function overlayBarState(state: string, o: { title?: string; body?: string; label?: string; prog?: number } = {}): void {
  try { M?.barState?.(state, o.title ?? '', o.body ?? '', o.label ?? '', o.prog ?? 0); } catch { /* indisponible */ }
}
export function overlayBarPlay(id: string): void { try { M?.barPlay?.(id); } catch { /* indisponible */ } }
export function overlayChatState(json: string): void { try { M?.chatState?.(json); } catch { /* indisponible */ } }
export function overlayChatInput(text: string): void { try { M?.chatInput?.(text); } catch { /* indisponible */ } }
export function overlayChatMic(on: boolean): void { try { M?.chatMic?.(on); } catch { /* indisponible */ } }
export function overlayChatText(text: string, done: boolean): void {
  try { M?.chatText?.(text, done); } catch { /* indisponible */ }
}

/* motifs des dernières fermetures de l'app, donnés par Android (diagnostic de plantage) */
export interface ExitInfo { reason: string; desc: string; time: number; rssMb: number; importance: number; trace: string }
export function appExits(): ExitInfo[] {
  try { return M?.lastExit ? M.lastExit() : []; } catch { return []; }
}

/* fil d'Ariane natif (écrit sur disque à chaque étape) */
export const trailNative = (text: string): void => { try { M?.trail?.(text); } catch { /* indisponible */ } };
export const readTrailNative = (): string => { try { return M?.readTrail ? String(M.readTrail()) : ''; } catch { return ''; } };
export const clearTrailNative = (): void => { try { M?.clearTrail?.(); } catch { /* indisponible */ } };

/* ouvre les réglages Android de la notification (promoted = autorisation de la puce « mises à jour en direct ») */
export function overlayNotifSettings(promoted = true): void { try { M?.openNotifSettings?.(promoted); } catch { /* indisponible */ } }

export async function overlayHide(): Promise<void> {
  try { await M?.hide(); } catch { /* indisponible */ }
}

/* SHA-256 natif en flux (rapide même pour 1 Go) — version installée uniquement */
export async function sha256FileNative(path: string): Promise<string | null> {
  try { return M ? await M.sha256File(path) : null; } catch { return null; }
}
