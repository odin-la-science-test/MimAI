/* MiMai — « mode en ligne » : l'IA en ligne est activée ET au moins un fournisseur est connecté.
   Sert à l'interface (couleurs bleues, textes honnêtes sur ce qui reste local ou non). Module pur. */
import type { CloudSettings } from './core.ts';

/* Internet joignable ? (mis à jour par l'app dès que la connexion change). Sans Internet, le mode en ligne est SUSPENDU : l'interface
   repasse en orange / hors ligne et le modèle du téléphone répond, jusqu'au retour de la connexion. */
export const netState = { up: true };
export const setInternetUp = (v: boolean): void => { netState.up = v; };

/* l'IA en ligne est activée ET au moins un fournisseur est connecté (indépendamment d'Internet) */
export function isOnlineConfigured(c: CloudSettings | undefined | null): boolean {
  return !!c && c.enabled && Object.keys(c.providers || {}).some(id => c.providers[id]?.enabled);
}

/* mode en ligne EFFECTIF : configuré ET Internet disponible */
export function isOnlineMode(c: CloudSettings | undefined | null): boolean {
  return netState.up && isOnlineConfigured(c);
}
