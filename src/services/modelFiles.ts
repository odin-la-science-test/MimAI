/* MiMai — accès disque pour la détection et l'import de modèles (la logique pure est dans installed.ts). */
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { MODELS, modelFilePath, mmprojPath, hashModelFile } from './net';
import { detectInstalled, candidatesBySize, matchByHash } from './installed';
import type { FileInfo, ImportFailure } from './installed';

/* ids des modèles dont le fichier est présent sur l'appareil avec la taille exacte ; null si le disque est illisible
   (dans ce cas on ne touche à rien : mieux vaut garder la liste actuelle que la vider par erreur) */
export async function scanModelFiles(): Promise<string[] | null> {
  try {
    const infos: Record<string, FileInfo> = {};
    for (const id of Object.keys(MODELS)) {
      try {
        const i = await FileSystem.getInfoAsync(modelFilePath(id));
        infos[id] = i.exists ? { exists: true, size: (i as { size?: number }).size } : { exists: false };
        /* un modèle de vision n'est installé que si son second fichier (mmproj) est lui aussi présent, à la taille exacte */
        const mm = MODELS[id].mmproj;
        if (mm && infos[id].exists) {
          const j = await FileSystem.getInfoAsync(mmprojPath(id));
          if (!j.exists || (j as { size?: number }).size !== mm.sizeBytes) infos[id] = { exists: false };
        }
      } catch { infos[id] = { exists: false }; }
    }
    return detectInstalled(MODELS, infos);
  } catch { return null; }
}

export type ImportResult = { ok: true; id: string } | { ok: false; failure: ImportFailure; extra?: string };
export type ImportPhase = 'choose' | 'copy' | 'sha';

/* Importe un fichier .gguf choisi par l'utilisateur. Il n'est accepté que s'il correspond EXACTEMENT à un modèle du
   catalogue (taille puis SHA-256) : MiMai n'installe jamais un fichier dont il ne peut pas garantir l'intégrité. */
export async function importModelFile(onPhase: (p: ImportPhase, pct: number) => void): Promise<ImportResult> {
  onPhase('choose', 0);
  let asset: DocumentPicker.DocumentPickerAsset | undefined;
  try {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: false, multiple: false });
    if (r.canceled || !r.assets?.length) return { ok: false, failure: 'canceled' };
    asset = r.assets[0];
  } catch (e) { return { ok: false, failure: 'error', extra: e instanceof Error ? e.message.slice(0, 80) : undefined }; }

  let size = typeof asset.size === 'number' ? asset.size : -1;
  if (size <= 0) {
    try { const i = await FileSystem.getInfoAsync(asset.uri); size = (i as { size?: number }).size ?? -1; } catch { size = -1; }
  }
  if (!(size > 0)) return { ok: false, failure: 'no-size' };
  /* l'import manuel ne gère qu'un seul fichier : les modèles de vision (deux fichiers) se téléchargent */
  const candidates = candidatesBySize(MODELS, size).filter(id => !MODELS[id].mmproj);
  if (!candidates.length) return { ok: false, failure: 'unknown-size' };

  const free = await FileSystem.getFreeDiskStorageAsync().catch(() => -1);
  if (free >= 0 && free < size * 1.05) return { ok: false, failure: 'disk', extra: String(Math.ceil((size * 1.05 - free) / 1e6)) };

  const dir = modelFilePath(candidates[0]).replace(/[^/]*$/, '');
  const tmp = dir + 'import.tmp';
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => { /* existe déjà */ });
    await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => { /* rien */ });
    onPhase('copy', 0);
    await FileSystem.copyAsync({ from: asset.uri, to: tmp });
  } catch (e) {
    await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => { /* rien */ });
    return { ok: false, failure: 'copy', extra: e instanceof Error ? e.message.slice(0, 80) : undefined };
  }

  try {
    onPhase('sha', 1);
    const got = await hashModelFile(tmp, size, p => onPhase('sha', Math.max(1, Math.min(99, p))));
    const id = matchByHash(MODELS, candidates, got);
    if (!id) { await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => { /* rien */ }); return { ok: false, failure: 'hash-mismatch' }; }
    const target = modelFilePath(id);
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => { /* rien */ });
    await FileSystem.moveAsync({ from: tmp, to: target });
    return { ok: true, id };
  } catch (e) {
    await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => { /* rien */ });
    return { ok: false, failure: 'error', extra: e instanceof Error ? e.message.slice(0, 80) : undefined };
  }
}
