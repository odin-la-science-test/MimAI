/* MiMai — détection des modèles DÉJÀ présents sur l'appareil.
   Source de vérité : les fichiers du dossier des modèles. Un fichier dont la taille correspond EXACTEMENT à celle d'un
   modèle du catalogue est un modèle installé : il a été téléchargé par MiMai, qui ne conserve un fichier qu'après
   vérification de la taille et du SHA-256 (un fichier incomplet ou corrompu est supprimé).
   Les fichiers importés à la main sont, eux, vérifiés par SHA-256 avant d'être acceptés (voir importModelFile).
   Cette partie est pure (sans accès au disque) pour être testable sous Node. */

export interface CatalogEntry { sizeBytes: number; sha256: string; file?: string }
export interface FileInfo { exists: boolean; size?: number }

/* modèles dont le fichier est présent avec la taille exacte */
export function detectInstalled(models: Record<string, CatalogEntry>, infos: Record<string, FileInfo | undefined>): string[] {
  return Object.keys(models).filter(id => {
    const i = infos[id];
    return !!i && i.exists && typeof i.size === 'number' && i.size === models[id].sizeBytes;
  });
}

export interface Reconciled { installed: string[]; activeModel: string; added: string[]; removed: string[] }

/* aligne la liste « installés » du réglage sur ce qui est RÉELLEMENT sur le disque ; garde un modèle actif valide */
export function reconcile(prev: string[], detected: string[], active: string, fallback: string): Reconciled {
  const known = new Set(detected);
  const kept = prev.filter(id => known.has(id));
  const added = detected.filter(id => !prev.includes(id));
  const removed = prev.filter(id => !known.has(id));
  const installed = [...kept, ...added];
  const activeModel = installed.includes(active) ? active : (installed[0] || fallback);
  return { installed, activeModel, added, removed };
}

/* candidats pour un fichier importé : même taille que le catalogue (plusieurs modèles peuvent partager une taille) */
export function candidatesBySize(models: Record<string, CatalogEntry>, size: number): string[] {
  return Object.keys(models).filter(id => models[id].sizeBytes === size);
}

/* parmi les candidats, celui dont l'empreinte SHA-256 correspond ; null si aucun (fichier inconnu ou corrompu) */
export function matchByHash(models: Record<string, CatalogEntry>, candidates: string[], sha256: string): string | null {
  const want = String(sha256 || '').toLowerCase();
  return candidates.find(id => models[id].sha256.toLowerCase() === want) ?? null;
}

export type ImportFailure = 'canceled' | 'no-size' | 'unknown-size' | 'disk' | 'copy' | 'hash-mismatch' | 'error';

export function describeImportFailure(f: ImportFailure, extra?: string): string {
  switch (f) {
    case 'canceled': return 'Import annulé.';
    case 'no-size': return 'Impossible de lire la taille de ce fichier : choisissez un fichier .gguf depuis le stockage du téléphone.';
    case 'unknown-size': return 'Ce fichier ne correspond à aucun modèle du catalogue de MiMai (taille inconnue). Seuls les modèles listés peuvent être importés, pour en garantir l’intégrité.';
    case 'disk': return 'Espace insuffisant pour copier ce modèle' + (extra ? ' (' + extra + ' Mo à libérer)' : '') + '.';
    case 'copy': return 'La copie du fichier a échoué' + (extra ? ' : ' + extra : '') + '.';
    case 'hash-mismatch': return 'Ce fichier est incomplet ou différent du modèle officiel (empreinte SHA-256 invalide) : il a été supprimé, rien n’a été installé.';
    default: return 'Import impossible' + (extra ? ' : ' + extra : '') + '.';
  }
}
