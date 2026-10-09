# Sécurité — MiMai

## Signaler une vulnérabilité
Écrivez à cells-atlas@gmail.com avec une description et les étapes de reproduction. N'ouvrez pas de ticket public. Réponse visée sous 7 jours.

## Modèle de menace et garanties

| Sujet | Mesure | Limite connue |
|---|---|---|
| Réseau | Politique DEFAULT DENY (`src/services/net.ts`) : `fetch` (et `XMLHttpRequest` en production) refusent toute requête hors fenêtre ; une fenêtre de 15 min n'est ouverte que par une action explicite ; elle expire seule et annule le téléchargement ; l'autorisation n'est jamais persistée (tout est bloqué à chaque démarrage). Re-blocage garanti par `try/finally`. | Le téléchargeur natif (`expo-file-system`) n'est pas intercepté par le garde-fou JS : il est borné par `assertAllowed()`, une liste blanche d'URL (`https://huggingface.co/`) et l'annulation à l'expiration. Le WebSocket n'est pas filtré (non utilisé). |
| Trafic en clair | `usesCleartextTraffic=false` + `network_security_config` (HTTPS seul). | — |
| Intégrité des modèles | Taille exacte + SHA-256 en flux comparés à des valeurs figées dans le code ; fichier supprimé si écart. | Le catalogue est figé dans l'application : changer un modèle demande une mise à jour de l'app. |
| Données au repos | AES-256-GCM (IV aléatoire par message), clé 256 bits dans SecureStore / Android Keystore ; si le Keystore est indisponible, l'app **n'écrase jamais** la clé (erreur plutôt que perte de données). | Pas de chiffrement dans Expo Go (mode test). Les métadonnées (titres de conversation, noms de documents, dates) ne sont pas chiffrées. Un appareil rooté ou déverrouillé n'est pas dans le périmètre. |
| Sauvegarde | `allowBackup=false` + règles d'extraction vides (cloud et transfert d'appareil). | — |
| Suppression | « Supprimer les données locales » efface les lignes, active `secure_delete` et compacte la base (`VACUUM`). | Les fichiers modèles se suppriment séparément (écran Modèles). |
| Télémétrie | Aucune. Le journal d'erreurs est local ; l'export de diagnostic est manuel et ne contient pas le texte des souvenirs. | — |
| Signature | Clé d'upload fournie par variables d'environnement (`MIMAI_UPLOAD_*`) ou gérée par EAS ; jamais dans le dépôt (`.gitignore` exclut `*.jks`, `*.keystore`, `.env*`). Play App Signing recommandé. | — |
| Bulle flottante | Variante optionnelle (`MIMAI_OVERLAY=1`) : service non exporté, ne lit pas l'écran, `START_NOT_STICKY`. | `SYSTEM_ALERT_WINDOW` est une permission sensible (voir la checklist Play). |

## Vérifications automatisables
- `npm run typecheck` — types stricts.
- `npm run crypto:check` — SHA-256 JS contre l'implémentation de référence de Node.
- `npm run test:training` — tests du pipeline d'entraînement.
- `npx expo-doctor` — cohérence du projet Expo.

## Secrets
Ne jamais committer : keystore, mots de passe, `credentials.json`, clés de compte de service Google. Si une clé d'upload fuite, demandez sa réinitialisation dans la Play Console (Intégrité de l'application).
