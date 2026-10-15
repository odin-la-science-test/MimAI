/* MiMai — « mode en ligne » : l'IA en ligne est activée ET au moins un fournisseur est connecté.
   Sert à l'interface (couleurs bleues, textes honnêtes sur ce qui reste local ou non). Module pur. */
import type { CloudSettings } from './core.ts';

export function isOnlineMode(c: CloudSettings | undefined | null): boolean {
  return !!c && c.enabled && Object.keys(c.providers || {}).some(id => c.providers[id]?.enabled);
}
