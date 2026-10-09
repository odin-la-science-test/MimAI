/* MiMai — import / export natifs pour l'apprentissage (README §9-14).
   Tout est local : le fichier .gguf vient d'un sélecteur de fichiers Android
   (aucun téléchargement), l'export JSONL est écrit dans un dossier choisi par
   l'utilisateur (Storage Access Framework). Aucun accès réseau.
   La logique de décision (compatibilité, benchmark, PASS/FAIL) est dans
   training.ts, testée sous Node. */
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import type { AppData } from './db';
import { sha256OfFile } from './crypto';
import { measureSpeed, type SpeedPoint } from './bench';
import { llamaAvailable, makeEvaluator, releaseLlama, LoraLoadError } from './engine';
import {
  datasetFrom, splitPairs, toJsonl, detectCapabilities, parseGguf, checkLoraCompat, runBenchmark, buildLoraOutcome,
  nextVersion, fmtVersion, adapterRelPath, parseMeta, EXPORT_SYSTEM, BASE_SPECS, snapshotFrom,
  type Capabilities, type TrainOutcome, type LoraCheck, type AdapterMeta, type BenchReport, type TrainPair, type ChatMsg,
} from './training';

const DOC = FileSystem.documentDirectory || '';

/* ───────────── capacités de l'appareil (réelles) ───────────── */
export interface DeviceCaps extends Capabilities { llama: boolean; modelInstalled: boolean; ramGb: number | null; battery: number | null; charging: boolean | null }
export async function getDeviceCaps(data: AppData): Promise<DeviceCaps> {
  const llama = llamaAvailable();
  const modelInstalled = data.settings.installed.includes(data.settings.activeModel);
  let battery: number | null = null, charging: boolean | null = null;
  try {
    const l = await Battery.getBatteryLevelAsync(); battery = l >= 0 ? l : null;
    const st = await Battery.getBatteryStateAsync(); charging = st === Battery.BatteryState.CHARGING || st === Battery.BatteryState.FULL;
  } catch { /* indisponible */ }
  const ram = Device.totalMemory ?? null;
  const caps = detectCapabilities({ llama, modelInstalled, ramBytes: ram, batteryLevel: battery, charging });
  return { ...caps, llama, modelInstalled, ramGb: ram ? Math.round((ram / 1024 ** 3) * 10) / 10 : null, battery, charging };
}

/* ───────────── utilitaires fichiers ───────────── */
function b64ToBytes(b64: string): Uint8Array {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (A.indexOf(clean[i]) << 18) | (A.indexOf(clean[i + 1]) << 12) | ((A.indexOf(clean[i + 2]) & 63) << 6) | (A.indexOf(clean[i + 3]) & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}
const readChunk = (uri: string) => (pos: number, len: number) => FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position: pos, length: len });
export const sha256File = (uri: string, size: number) => sha256OfFile(uri, size, readChunk(uri));

export async function deleteAdapterFiles(file: string | undefined): Promise<void> {
  if (!file) return;
  const dir = file.replace(/\/[^/]+$/, '/');
  await FileSystem.deleteAsync(DOC + dir, { idempotent: true }).catch(() => { /* déjà absent */ });
}

/* vérifie qu'un adaptateur enregistré n'a pas été altéré (taille + SHA-256) */
export async function verifyAdapter(meta: AdapterMeta): Promise<{ ok: boolean; reason: string }> {
  if (meta.kind !== 'lora' || !meta.file || !meta.sha256) return { ok: true, reason: 'Profil sans fichier : rien à vérifier.' };
  const uri = DOC + meta.file;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return { ok: false, reason: 'Fichier introuvable.' };
  if (meta.sizeBytes && info.size !== meta.sizeBytes) return { ok: false, reason: 'Taille modifiée.' };
  const h = await sha256File(uri, info.size);
  return h === meta.sha256 ? { ok: true, reason: 'SHA-256 conforme.' } : { ok: false, reason: 'SHA-256 différent : fichier altéré.' };
}

/* ───────────── export du dataset pour entraînement sur PC ───────────── */
export interface ExportResult { ok: boolean; message: string; files: string[]; counts?: { train: number; eval: number; preference: number } }
export async function exportDataset(data: AppData, format: 'chat' | 'alpaca' = 'chat'): Promise<ExportResult> {
  const ds = datasetFrom(data, { useExamples: true, useConvs: true, useDocs: false });
  const { train, holdout } = splitPairs(ds.pairs);
  if (ds.pairs.length < 8) return { ok: false, message: 'Au moins 8 exemples utilisables sont nécessaires (' + ds.pairs.length + ' pour l’instant).', files: [] };
  const files: [string, string][] = [
    ['mimai_train.jsonl', toJsonl(train, format)],
    ['mimai_eval.jsonl', toJsonl(holdout, format)],
  ];
  const prefs = toJsonl(ds.pairs, 'preference');
  if (prefs) files.push(['mimai_preferences.jsonl', prefs]);
  const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!perm.granted) return { ok: false, message: 'Aucun dossier choisi : export annulé.', files: [] };
  const written: string[] = [];
  for (const [name, body] of files) {
    if (!body) continue;
    const uri = await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri, name, 'application/octet-stream');
    await FileSystem.writeAsStringAsync(uri, body, { encoding: FileSystem.EncodingType.UTF8 });
    written.push(name);
  }
  return { ok: true, message: 'Export terminé dans le dossier choisi (aucun envoi réseau).', files: written, counts: { train: train.length, eval: holdout.length, preference: prefs ? prefs.trim().split('\n').length : 0 } };
}

/* ───────────── import d'un adaptateur LoRA GGUF ───────────── */
export type ImportPhase = 'pick' | 'header' | 'sha' | 'copy' | 'bench' | 'decide';
export interface ImportResult { status: 'cancelled' | 'rejected' | 'done'; errors: string[]; warnings: string[]; check?: LoraCheck; outcome?: TrainOutcome; sha256?: string }

export async function importLora(
  data: AppData,
  scale: number,
  onPhase: (p: ImportPhase, pct: number) => void
): Promise<ImportResult> {
  const modelId = data.settings.activeModel;
  if (!BASE_SPECS[modelId]) return { status: 'rejected', errors: ['Modèle de base non géré : ' + modelId], warnings: [] };
  if (!data.settings.installed.includes(modelId)) return { status: 'rejected', errors: ['Installez d’abord le modèle de base (' + modelId + ').'], warnings: [] };
  if (!llamaAvailable()) return { status: 'rejected', errors: ['llama.rn est absent (Expo Go) : impossible de charger ni d’évaluer un adaptateur. Utilisez le build natif.'], warnings: [] };

  onPhase('pick', 0);
  const pick = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (pick.canceled || !pick.assets?.length) return { status: 'cancelled', errors: [], warnings: [] };
  const asset = pick.assets[0];
  const tmp = asset.uri;
  const cleanupTmp = () => FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => { /* ignore */ });
  const info = await FileSystem.getInfoAsync(tmp);
  const size = info.exists ? info.size : asset.size ?? 0;

  onPhase('header', 10);
  const headLen = Math.min(size, 1 << 20);
  let head: Uint8Array;
  try { head = b64ToBytes(await readChunk(tmp)(0, headLen)); } catch { await cleanupTmp(); return { status: 'rejected', errors: ['Lecture du fichier impossible.'], warnings: [] }; }
  const gg = parseGguf(head);
  const check = checkLoraCompat(gg, modelId, size, asset.name || '');
  if (!check.ok) { await cleanupTmp(); return { status: 'rejected', errors: check.errors, warnings: check.warnings, check }; }

  onPhase('sha', 20);
  const sha = await sha256File(tmp, size);

  onPhase('copy', 50);
  const v = nextVersion(data.adapters);
  const rel = adapterRelPath(v);
  const dir = DOC + rel.replace(/\/[^/]+$/, '/');
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => { /* existe */ });
  await FileSystem.copyAsync({ from: tmp, to: DOC + rel });
  await cleanupTmp();

  const { holdout, train } = splitPairs(datasetFrom(data, { useExamples: true, useConvs: true, useDocs: false }).pairs);
  const name = 'LoRA ' + (asset.name || 'adaptateur').replace(/\.gguf$/i, '');
  const inp = { modelId, name, file: rel, sha256: sha, sizeBytes: size, scale, check, examples: train.length + holdout.length };

  onPhase('bench', 60);
  let bench: BenchReport | null = null;
  let benchError: string | undefined;
  let speedBase: SpeedPoint[] = [], speedCand: SpeedPoint[] = [];
  try {
    const ev = await makeEvaluator(modelId, { path: DOC + rel, scale });
    if (!ev) benchError = 'Moteur ou modèle indisponible : benchmark impossible.';
    else if (holdout.length < 2) benchError = 'Pas de jeu de test local : ajoutez au moins 8 exemples (le même découpage est utilisé pour l’export PC).';
    else {
      bench = await runBenchmark(ev, {
        holdout,
        messagesFor: (q: string): ChatMsg[] => [{ role: 'system', content: EXPORT_SYSTEM }, { role: 'user', content: q }],
        onProgress: (d, t) => onPhase('bench', 60 + (d / t) * 30),
      });
      /* vitesse avant (modèle de base) / après (avec l'adaptateur), mêmes questions */
      if (ev.timed) {
        const t = { timed: ev.timed.bind(ev) };
        const msgs = (q: string): ChatMsg[] => [{ role: 'system', content: EXPORT_SYSTEM }, { role: 'user', content: q }];
        speedBase = await measureSpeed(t, ['court', 'moyen'], 'base', msgs).catch(() => []);
        speedCand = await measureSpeed(t, ['court', 'moyen'], 'cand', msgs).catch(() => []);
      }
    }
  } catch (e) {
    benchError = e instanceof LoraLoadError
      ? 'Le chargeur natif a refusé l’adaptateur (modèle de base incompatible ?) : ' + e.message
      : 'Benchmark interrompu : ' + String((e as Error)?.message || e);
  }

  onPhase('decide', 97);
  const outcome = buildLoraOutcome(inp, bench, benchError);
  if (bench) outcome.benches = [
    snapshotFrom('avant', 'Avant · ' + name, modelId, bench.base, speedBase, outcome.run.id),
    snapshotFrom('apres', 'Après · ' + name, modelId, bench.cand, speedCand, outcome.run.id),
  ];
  if (!outcome.adapter) {
    await releaseLlama(); /* décharge l'adaptateur refusé avant suppression du fichier */
    await deleteAdapterFiles(rel);
  } else {
    const meta = parseMeta(outcome.adapter.rules);
    await FileSystem.writeAsStringAsync(dir + 'manifest.json', JSON.stringify({ version: fmtVersion(v), createdAt: Date.now(), meta, bench: outcome.report.bench ? { base: outcome.report.bench.base, cand: outcome.report.bench.cand } : null }, null, 2)).catch(() => { /* non bloquant */ });
  }
  onPhase('decide', 100);
  return { status: 'done', errors: [], warnings: check.warnings, check, outcome, sha256: sha };
}

export type { TrainPair };
