/* MiMai — IA en ligne : branchement sur l'app (coffre de clés Android, réglages persistés, réseau réel). */
import * as SecureStore from 'expo-secure-store';
import { CloudEngine, defaultCloud } from './core.ts';
import type { CloudSettings } from './core.ts';
import { PROVIDERS } from './providers.ts';
import * as client from './client.ts';
import type { CloudHook } from '../engine';

export { defaultCloud };
export type { CloudSettings };

/* clés : coffre Android (Keystore), jamais dans la base ni dans les exports de diagnostic */
const KEY = (id: string) => 'mimai_cloud_' + id;
const cache: Record<string, string | null> = {};
let loaded = false;

export async function loadCloudKeys(): Promise<void> {
  for (const p of PROVIDERS) {
    try { cache[p.id] = (await SecureStore.getItemAsync(KEY(p.id))) || null; } catch { cache[p.id] = null; }
  }
  loaded = true;
}
export const cloudKeysLoaded = () => loaded;
export const hasCloudKey = (id: string): boolean => !!cache[id];

async function setKey(id: string, key: string | null): Promise<void> {
  cache[id] = key;
  try {
    if (key) await SecureStore.setItemAsync(KEY(id), key);
    else await SecureStore.deleteItemAsync(KEY(id));
  } catch { /* coffre indisponible (Expo Go) : la clé reste en mémoire pour la session */ }
}

let engine: CloudEngine | null = null;
let current: { get: () => CloudSettings; set: (fn: (c: CloudSettings) => void) => void } | null = null;

/* l'état (réglages) vit dans AppData : state.tsx fournit get/set à chaque rendu */
export function bindCloud(get: () => CloudSettings, set: (fn: (c: CloudSettings) => void) => void): CloudEngine {
  current = { get, set };
  if (!engine) {
    engine = new CloudEngine({
      chat: (id, key, account, model, messages, o) => client.chat(id, key, account, model, messages, o),
      listModels: (id, key, account) => client.listModels(id, key, account),
      getKey: id => cache[id] || null,
      setKey,
      now: () => Date.now(),
      get: () => current!.get(),
      set: fn => current!.set(fn),
    });
  }
  return engine;
}
export const cloudEngine = (): CloudEngine | null => engine;

/* ce que le moteur de réponses reçoit : rien du tout (undefined) tant que l'IA en ligne est désactivée */
export function cloudHook(): CloudHook | undefined {
  const c = current?.get();
  const e = engine;
  if (!e || !c || !c.enabled) return undefined;
  return {
    policy: c.policy, shareContext: c.shareContext, sharePhotos: c.sharePhotos,
    available: (k, v, p, m) => e.available(k, v, p, m),
    run: r => e.complete(r),
  };
}
