/* MiMai — journal de plantages EXHAUSTIF, lisible dans l'app (Réglages → Rapport de plantage).
   Quatre sources, rassemblées en un seul rapport à copier-coller :
   1. le « fil d'Ariane » : étapes techniques (chargement du modèle, génération, écrans, mémoire) écrites tout de suite
      sur disque par le module natif, donc conservées même si l'application est tuée sans prévenir ;
   2. les erreurs JavaScript (fatales ou non, promesses rejetées, erreurs d'affichage React, console.error) ;
   3. les motifs de fermeture donnés par Android (plantage natif avec la trace, manque de mémoire, ANR) ;
   4. l'appareil, la version et les réglages utiles.
   Vie privée : aucun texte de conversation, aucun document, aucune donnée personnelle n'est écrit. Le rapport reste sur
   l'appareil : il n'est envoyé nulle part, c'est l'utilisateur qui le copie ou le partage. */
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { trailNative, readTrailNative, clearTrailNative, appExits } from './overlay';
import type { AppData } from './db';

const ring: string[] = [];
const oneLine = (s: unknown, max = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const stamp = () => { const d = new Date(); const p = (n: number, w = 2) => String(n).padStart(w, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3); };

/* ajoute une étape au fil d'Ariane (jamais de texte de conversation) */
export function trail(msg: string): void {
  const line = oneLine(msg, 600);
  ring.push(stamp() + ' ' + line);
  if (ring.length > 250) ring.shift();
  trailNative(line);
}

export function recordJsError(kind: string, err: unknown, fatal = false): void {
  const e = err as { message?: string; stack?: string; componentStack?: string } | undefined;
  trail('ERREUR JS' + (fatal ? ' FATALE' : '') + ' [' + kind + '] ' + oneLine(e?.message ?? err, 300) + ' :: ' + oneLine(e?.stack, 1400) + (e?.componentStack ? ' :: composants ' + oneLine(e.componentStack, 500) : ''));
}

let installed = false;
export function installCrashHandlers(): void {
  if (installed) return;
  installed = true;
  trail('=== démarrage de MiMai (JS) ===');
  type Handler = (e: Error, isFatal?: boolean) => void;
  const g = globalThis as unknown as {
    ErrorUtils?: { getGlobalHandler?: () => Handler; setGlobalHandler: (h: Handler) => void };
    HermesInternal?: { enablePromiseRejectionTracker?: (o: { allRejections: boolean; onUnhandled: (id: number, e: unknown) => void }) => void };
  };
  const previous = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler((err, isFatal) => {
    recordJsError('non gérée', err, !!isFatal);
    previous?.(err, isFatal);
  });
  try {
    g.HermesInternal?.enablePromiseRejectionTracker?.({ allRejections: true, onUnhandled: (_id, e) => recordJsError('promesse rejetée', e) });
  } catch { /* suivi des promesses indisponible */ }
  /* console.error : souvent le seul indice d'un problème non fatal ; limité pour ne pas inonder le journal */
  const origError = console.error;
  let n = 0, windowStart = Date.now();
  console.error = (...args: unknown[]) => {
    const now = Date.now();
    if (now - windowStart > 10000) { windowStart = now; n = 0; }
    if (n++ < 5) trail('console.error ' + oneLine(args.map(a => (a instanceof Error ? a.message : String(a))).join(' '), 350));
    origError(...args);
  };
  AppState.addEventListener('change', s => trail('application → ' + s));
}

/* texte complet à copier : tout ce qui sert à comprendre un plantage */
export function buildReport(data: AppData | null, extra: string[] = []): string {
  const L: string[] = [];
  const cfg = Constants.expoConfig;
  L.push('=== RAPPORT DE PLANTAGE MiMai ===');
  L.push('Généré le : ' + new Date().toLocaleString('fr-FR'));
  L.push('Version : ' + (cfg?.version ?? '?') + ' · code ' + ((cfg?.android as { versionCode?: number } | undefined)?.versionCode ?? '?'));
  L.push('Appareil : ' + (Device.manufacturer ?? '?') + ' ' + (Device.modelName ?? '?') + ' · Android ' + (Device.osVersion ?? '?') + ' · mémoire totale ' + (Device.totalMemory ? Math.round(Device.totalMemory / 1024 ** 2) + ' Mo' : '?'));
  extra.forEach(x => L.push(x));
  if (data) {
    const s = data.settings;
    L.push('Modèle actif : ' + s.activeModel + ' · installés : ' + (s.installed.join(', ') || 'aucun'));
    L.push('Mode : ' + s.mode + ' · compatibilité : ' + (s.compat ? 'oui' : 'non') + ' · vitesses mesurées : ' + JSON.stringify(s.speed || {}));
    L.push('Données : ' + data.convs.length + ' conversations, ' + data.docs.length + ' documents, ' + data.adapters.length + ' adaptateurs');
  }

  L.push('', '--- Fermetures de l’app vues par Android (les plus récentes d’abord) ---');
  const exits = appExits();
  if (!exits.length) L.push('aucune information (Android 11+ et version avec module natif requis)');
  exits.forEach(x => {
    L.push('• ' + new Date(x.time).toLocaleString('fr-FR') + ' : ' + x.reason + (x.desc ? ' — ' + x.desc : '') + (x.rssMb ? ' — mémoire ' + x.rssMb + ' Mo' : ''));
    if (x.trace) L.push('  trace native : ' + x.trace.slice(0, 1800));
  });

  L.push('', '--- Erreurs JavaScript enregistrées en base ---');
  const crashes = data?.crashes || [];
  if (!crashes.length) L.push('aucune');
  crashes.forEach(c => L.push('• ' + new Date(c.t).toLocaleString('fr-FR') + ' : ' + oneLine(c.msg, 300) + (c.stack ? ' :: ' + oneLine(c.stack, 500) : '')));

  L.push('', '--- Fil d’Ariane (étapes juste avant, les plus récentes en bas) ---');
  const native = readTrailNative().trim();
  const lines = native ? native.split('\n') : ring;
  if (!lines.length) L.push('vide');
  lines.slice(-90).forEach(l => L.push(l));
  L.push('', '=== FIN DU RAPPORT ===');
  return L.join('\n');
}

export function clearReport(): void {
  ring.length = 0;
  clearTrailNative();
}
