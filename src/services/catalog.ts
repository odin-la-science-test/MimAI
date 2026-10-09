/* MiMai — catalogue de modèles, chargé depuis src/data/catalog.json (généré à part, valeurs vérifiées
   sur l'API Hugging Face). Ce module n'ouvre aucune connexion : il ne fait que lire le JSON embarqué.
   Les entrées invalides (champ manquant, URL hors Hugging Face, doublon) sont ignorées sans planter.
   Les ids historiques (qwen05b, smollm17b, qwen15b) sont conservés tels quels par le catalogue. */
import raw from '../data/catalog.json';
import visionRaw from '../data/vision.json';
import { qualityScore } from './fit';

export interface ModelDef {
  id: string; name: string; params: string; quant: string; ctx: string;
  tier: string; version: string; license: string; explain: string;
  sizeBytes: number; sha256: string; file: string; url: string;
  /* extras du catalogue */
  family: string; paramsB: number; tags: string[]; needRamGb: number;
  licenseNote?: string; repo: string; rank?: number;
  /* modèles de vision : second fichier (« mmproj ») nécessaire pour comprendre les images */
  mmproj?: MmprojDef;
}

export interface MmprojDef { file: string; url: string; sizeBytes: number; sha256: string }

interface CatalogEntry {
  id: string; name: string; family: string; paramsB: number; paramsLabel: string; quant: string; ctx: string;
  license: string; licenseNote?: string; tags: string[]; explain: string; sizeBytes: number; sha256: string;
  file: string; url: string; repo: string; needRamGb: number; rank?: number; mmproj?: Partial<MmprojDef>;
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

function validMmproj(m: Partial<MmprojDef> | undefined): m is MmprojDef {
  return !!m && isStr(m.file) && isStr(m.url) && m.url.startsWith('https://huggingface.co/') && isNum(m.sizeBytes) && isStr(m.sha256) && /^[0-9a-f]{64}$/.test(m.sha256);
}

function valid(e: Partial<CatalogEntry> | null | undefined): e is CatalogEntry {
  /* une entrée qui déclare un mmproj invalide est rejetée : un modèle de vision sans son second fichier ne servirait à rien */
  if (e && e.mmproj !== undefined && !validMmproj(e.mmproj)) return false;
  return !!e && isStr(e.id) && isStr(e.name) && isStr(e.family) && isNum(e.paramsB) && isStr(e.paramsLabel)
    && isStr(e.quant) && isStr(e.ctx) && isStr(e.license) && isStr(e.explain) && isNum(e.sizeBytes)
    && isStr(e.sha256) && /^[0-9a-f]{64}$/.test(e.sha256) && isStr(e.file) && isStr(e.url)
    && e.url.startsWith('https://huggingface.co/') && isStr(e.repo) && isNum(e.needRamGb) && Array.isArray(e.tags);
}

/* palier lisible, dérivé de la taille du fichier */
export function tierFor(sizeBytes: number): string {
  const g = sizeBytes / 1e9;
  return g < 0.8 ? 'Modèle compact' : g < 1.6 ? 'Modèle équilibré' : g < 2.8 ? 'Modèle avancé' : 'Modèle lourd';
}

function build(): Record<string, ModelDef> {
  const list = [...((raw as { models?: Partial<CatalogEntry>[] }).models || []), ...((visionRaw as { models?: Partial<CatalogEntry>[] }).models || [])];
  const out: Record<string, ModelDef> = {};
  for (const e of list) {
    if (!valid(e) || out[e.id]) continue;
    out[e.id] = {
      id: e.id, name: e.name, params: e.paramsLabel + ' paramètres', quant: e.quant, ctx: e.ctx,
      tier: tierFor(e.sizeBytes), version: '1.0.0', license: e.license, explain: e.explain,
      sizeBytes: e.sizeBytes, sha256: e.sha256, file: e.file, url: e.url,
      family: e.family, paramsB: e.paramsB, tags: e.tags.filter(isStr), needRamGb: e.needRamGb,
      licenseNote: isStr(e.licenseNote) ? e.licenseNote : undefined, repo: e.repo,
      rank: typeof e.rank === 'number' ? e.rank : undefined,
      mmproj: e.mmproj && validMmproj(e.mmproj) ? { file: e.mmproj.file, url: e.mmproj.url, sizeBytes: e.mmproj.sizeBytes, sha256: e.mmproj.sha256 } : undefined,
    };
  }
  return out;
}

export const MODELS: Record<string, ModelDef> = build();

/* « meilleur d'abord » : classement du catalogue (rank 1 = meilleur) s'il existe, sinon qualité attendue */
export const ORDER: string[] = Object.values(MODELS)
  .sort((a, b) => {
    const ra = a.rank ?? Infinity, rb = b.rank ?? Infinity;
    if (ra !== rb) return ra - rb;
    const d = qualityScore(b) - qualityScore(a);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  })
  .map(m => m.id);

/* modèle de repli (aucun choix de l'utilisateur) : le plus léger, donc le plus sûr */
export const DEFAULT_MODEL_ID: string = MODELS.qwen05b
  ? 'qwen05b'
  : (Object.values(MODELS).sort((a, b) => a.sizeBytes - b.sizeBytes)[0]?.id ?? '');
