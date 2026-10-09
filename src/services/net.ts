/* MiMai — politique réseau : DEFAULT DENY (README §2, ADR-003).
   Le réseau est bloqué par défaut ; l'unique exception est le téléchargement
   explicite d'un modèle, dans une fenêtre de 15 minutes.
   Catalogue RÉEL : modèles GGUF officiels hébergés sur Hugging Face, avec
   taille exacte et empreinte SHA-256 du fichier publié. Le pipeline vérifie
   taille + SHA-256 (flux, Go compris) avant installation, puis re-bloque.
   Garanties : (1) rien ne part sans autorisation explicite ; (2) le re-blocage
   a lieu dès la fin du téléchargement et, quoi qu'il arrive, dans un finally ;
   (3) la fenêtre expire seule au bout de 15 min et annule le téléchargement ;
   (4) l'autorisation n'est jamais persistée : au démarrage, tout est bloqué. */
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import { File, FileMode } from 'expo-file-system';
import { sha256OfFile, sha256OfHandle } from './crypto';

/* Le catalogue (≈100 modèles) vit dans src/data/catalog.json ; voir services/catalog.ts.
   Tailles et empreintes SHA-256 y sont relevées sur l'API officielle Hugging Face (octets exacts). */
import { MODELS, ORDER } from './catalog';
import type { ModelDef } from './catalog';
export { MODELS, ORDER };
export type { ModelDef };

export const AUTH_MS = 15 * 60 * 1000;
/* le catalogue ne pointe que vers ce domaine (les redirections CDN de Hugging Face
   sont suivies par le téléchargeur natif) */
const ALLOWED_URL_PREFIX = 'https://huggingface.co/';

/* journal réseau : l'app enregistre un récepteur (state.tsx) qui persiste */
type LogFn = (ev: string) => void;
let logger: LogFn = () => {};
export function setNetLogger(fn: LogFn) { logger = fn; }
const NET_LOG = (ev: string) => { try { logger(ev); } catch { /* jamais bloquant */ } };

export type NetState = 'blocked' | 'authorized';

class NetworkPolicy {
  private until = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(until: number | null) => void>();
  private cancelers = new Set<() => void>();

  state(): NetState { return Date.now() < this.until ? 'authorized' : 'blocked'; }
  remaining(): number { return Math.max(0, this.until - Date.now()); }
  assertAllowed(): void {
    if (this.state() !== 'authorized') throw new Error('NETWORK_BLOCKED');
  }
  /* abonnement aux changements d'état (until = fin de fenêtre, ou null si bloqué) */
  subscribe(fn: (until: number | null) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  /* enregistre une action d'annulation (téléchargement en cours) déclenchée au blocage */
  onBlock(fn: () => void): () => void {
    this.cancelers.add(fn);
    return () => { this.cancelers.delete(fn); };
  }
  private notify(until: number | null) {
    this.listeners.forEach(fn => { try { fn(until); } catch { /* jamais bloquant */ } });
  }
  authorize(reason: string): void {
    if (this.timer) clearTimeout(this.timer);
    this.until = Date.now() + AUTH_MS;
    /* la fenêtre se referme toute seule, même si l'écran est quitté */
    this.timer = setTimeout(() => this.block('fenêtre de 15 min écoulée'), AUTH_MS);
    NET_LOG('Réseau autorisé (15 min) — ' + reason);
    this.notify(this.until);
  }
  block(reason?: string): void {
    const wasOpen = this.until > 0;
    this.until = 0;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const pending = Array.from(this.cancelers);
    this.cancelers.clear();
    pending.forEach(fn => { try { fn(); } catch { /* best effort */ } });
    if (wasOpen) NET_LOG('Réseau bloqué' + (reason ? ' — ' + reason : ''));
    this.notify(null);
  }
}

export const NET = new NetworkPolicy();

/* — garde-fou global : toute requête JS hors fenêtre est refusée et journalisée —
   (le téléchargement natif des modèles est borné séparément : voir installModel) */
const _fetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (NET.state() !== 'authorized') {
    const u = typeof input === 'string' ? input : (input as { url?: string }).url || String(input);
    NET_LOG('Tentative réseau bloquée : ' + u.slice(0, 80));
    return Promise.reject(new Error('NETWORK_BLOCKED_BY_POLICY'));
  }
  return _fetch(input, init);
}) as typeof fetch;

/* idem pour XMLHttpRequest (bibliothèques tierces) — hors développement (Metro en a besoin) */
if (!__DEV__ && typeof XMLHttpRequest !== 'undefined') {
  const _open = XMLHttpRequest.prototype.open as (...a: unknown[]) => void;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    if (NET.state() !== 'authorized') {
      NET_LOG('Tentative réseau bloquée (XHR) : ' + String(url).slice(0, 80));
      throw new Error('NETWORK_BLOCKED_BY_POLICY');
    }
    return _open.call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
}

/* ─────────── manifeste d'un modèle (README §19) ─────────── */
export interface ModelManifest {
  id: string; version: string; format: string; quantization: string; size: number;
  sha256: string; license: string; capabilities: string[];
}

export function buildManifest(id: string): ModelManifest {
  const m = MODELS[id];
  return {
    id: m.id, version: m.version, format: 'GGUF', quantization: m.quant,
    size: m.sizeBytes, sha256: m.sha256, license: m.license,
    capabilities: ['text', 'reasoning', 'tools'],
  };
}

export interface PhaseInfo { got?: string; ok?: boolean }
export type PhaseFn = (phase: 'download' | 'size' | 'sha' | 'manifest' | 'license' | 'install', pct: number, info?: PhaseInfo) => void;

const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/* — pipeline complet : download → taille → SHA-256 → manifeste → licence → install → re-blocage —
   Le réseau n'est utile que pendant le téléchargement : il est re-bloqué dès qu'il se termine
   (succès ou échec) ; le bloc finally garantit le re-blocage et le nettoyage du fichier partiel. */
export async function installModel(id: string, onPhase: PhaseFn, opts: { wifiOnly?: boolean } = {}): Promise<ModelManifest> {
  const m = MODELS[id];
  if (!m) throw new Error('UNKNOWN_MODEL');
  NET.assertAllowed();
  if (!m.url.startsWith(ALLOWED_URL_PREFIX)) { NET.block('URL de modèle non autorisée'); throw new Error('URL_NOT_ALLOWED'); }

  const target = modelFilePath(id);
  let dl: FileSystem.DownloadResumable | null = null;
  const unregister = NET.onBlock(() => { void dl?.pauseAsync().catch(() => { /* déjà terminé */ }); });
  let ok = false;
  try {
    if (opts.wifiOnly) {
      const st = await Network.getNetworkStateAsync().catch(() => null);
      if (st && st.type === Network.NetworkStateType.CELLULAR) throw new Error('WIFI_REQUIRED');
      if (st && st.isConnected === false) throw new Error('OFFLINE');
    }
    /* espace disque : le fichier + une marge pour la vérification */
    const free = await FileSystem.getFreeDiskStorageAsync().catch(() => -1);
    if (free >= 0 && free < m.sizeBytes * 1.1) throw new Error('DISK_FULL:' + Math.ceil((m.sizeBytes * 1.1 - free) / 1e6));
    await FileSystem.makeDirectoryAsync(target.slice(0, target.lastIndexOf('/') + 1), { intermediates: true }).catch(() => { /* existe déjà */ });

    onPhase('download', 0);
    dl = FileSystem.createDownloadResumable(m.url, target, {},
      (wp) => { if (wp.totalBytesExpectedToWrite > 0) onPhase('download', (wp.totalBytesWritten / wp.totalBytesExpectedToWrite) * 100); });
    let res: FileSystem.FileSystemDownloadResult | undefined;
    let dlError = '';
    const progress = (wp: FileSystem.DownloadProgressData) => { if (wp.totalBytesExpectedToWrite > 0) onPhase('download', (wp.totalBytesWritten / wp.totalBytesExpectedToWrite) * 100); };
    /* jusqu'à 3 tentatives : reprise si possible, sinon nouveau départ (coupure Wi-Fi, CDN qui ferme la connexion) */
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt === 0) res = await dl.downloadAsync();
        else {
          try { res = await dl.resumeAsync(); }
          catch {
            await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => { /* rien */ });
            dl = FileSystem.createDownloadResumable(m.url, target, {}, progress);
            res = await dl.downloadAsync();
          }
        }
        dlError = '';
        break;
      } catch (err) {
        dlError = err instanceof Error ? err.message : String(err);
        res = undefined;
        NET_LOG('Téléchargement ' + m.name + ' : tentative ' + (attempt + 1) + ' échouée (' + dlError.slice(0, 80) + ')');
        if (NET.state() !== 'authorized') break; /* fenêtre fermée : on n'insiste pas */
        await pause(1500 * (attempt + 1));
      }
    }
    unregister();
    NET.block('téléchargement terminé'); /* le reste du pipeline est 100 % local */
    if (!res || (res.status !== 200 && res.status !== 206)) throw new Error('DOWNLOAD_FAILED:' + (dlError || (res ? 'HTTP ' + res.status : 'interrompu')).slice(0, 160));

    onPhase('size', 100);
    const info = await FileSystem.getInfoAsync(target);
    if (!info.exists || info.size !== m.sizeBytes) throw new Error('SIZE_MISMATCH');

    onPhase('sha', 1);
    const got = await hashModelFile(target, m.sizeBytes, p => onPhase('sha', Math.max(1, Math.min(99, p))));
    onPhase('sha', 100, { got, ok: got === m.sha256 });
    if (got !== m.sha256) throw new Error('CHECKSUM_INVALID');
    await pause(200);

    const manifest = buildManifest(id);
    onPhase('manifest', 100, { got: manifest.sha256, ok: true });
    await pause(250);
    onPhase('license', 100);
    await pause(250);
    onPhase('install', 100);
    await pause(350);

    NET_LOG('Modèle ' + m.name + ' installé (SHA-256 vérifié)');
    ok = true;
    return manifest;
  } catch (e) {
    NET_LOG('Installation de ' + m.name + ' annulée : ' + (e instanceof Error ? e.message : 'erreur'));
    throw e;
  } finally {
    unregister();
    NET.block('retour au mode bloqué'); /* idempotent : garantit le re-blocage dans tous les cas */
    if (!ok) await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => { /* rien à nettoyer */ });
  }
}

/* message lisible pour l'utilisateur (la cause réelle est affichée, jamais un message générique) */
export function describeInstallError(message: string): string {
  if (message === 'CHECKSUM_INVALID') return 'Empreinte SHA-256 invalide : fichier supprimé, rien n’a été installé.';
  if (message === 'SIZE_MISMATCH') return 'Taille inattendue : fichier supprimé, rien n’a été installé.';
  if (message === 'OFFLINE') return 'Pas de connexion Internet : vérifiez votre réseau (Wi-Fi ou données mobiles) puis réessayez.';
  if (message.startsWith('DISK_FULL:')) return 'Espace insuffisant : libérez environ ' + message.slice('DISK_FULL:'.length) + ' Mo puis réessayez.';
  if (message === 'WIFI_REQUIRED') return 'Téléchargement refusé : le réglage « Wi-Fi uniquement » est actif.';
  if (message === 'NETWORK_BLOCKED') return 'Le réseau est bloqué : autorisez le téléchargement puis réessayez.';
  if (message === 'URL_NOT_ALLOWED') return 'Adresse de modèle non autorisée.';
  if (message.startsWith('DOWNLOAD_FAILED:')) return 'Téléchargement impossible (' + message.slice('DOWNLOAD_FAILED:'.length) + ').';
  return 'Installation impossible (' + (message || 'erreur inconnue').slice(0, 160) + ').';
}

/* SHA-256 d'un fichier de modèle déjà sur l'appareil (téléchargé OU importé) : voie rapide par octets directs, sinon lecture base64 */
export async function hashModelFile(target: string, sizeBytes: number, onProgress?: (pct: number) => void): Promise<string> {
  try {
    const handle = new File(target).open(FileMode.ReadOnly);
    try { return await sha256OfHandle(sizeBytes, handle, onProgress); } finally { try { handle.close(); } catch { /* déjà fermé */ } }
  } catch (fastErr) {
    NET_LOG('SHA-256 : voie rapide indisponible (' + (fastErr instanceof Error ? fastErr.message : String(fastErr)).slice(0, 80) + '), lecture base64');
    return sha256OfFile(target, sizeBytes, (pos, len) =>
      FileSystem.readAsStringAsync(target, { position: pos, length: len, encoding: FileSystem.EncodingType.Base64 }), onProgress);
  }
}

/* chemin local d'un modèle installé (pour llama.rn) */
export function modelFilePath(id: string): string {
  return (FileSystem.documentDirectory || '') + 'models/' + MODELS[id].file;
}

export async function deleteModelFile(id: string): Promise<void> {
  if (!MODELS[id]) return;
  await FileSystem.deleteAsync(modelFilePath(id), { idempotent: true }).catch(() => { /* déjà absent */ });
}
