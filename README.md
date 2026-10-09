# MiMai — application React Native (Android)

> **Votre IA. Votre appareil. Vos données. Aucun serveur nécessaire.**

Implémentation React Native (Expo) du cahier des charges [`README_MiMai.md`](../README_MiMai.md),
avec la direction artistique du dossier [`disagne/`](../disagne) : design system « Organic »
(fond crème `#f5ead8`, terracotta `#c67139`, olive `#7a8a5e`, Caprasimo + Figtree),
personnage **Mìmir** animé (60 mouvements), écrans conformes aux maquettes.

## Test mobile avec Expo Go (le plus rapide)

1. Installez **Expo Go** depuis le Play Store sur votre téléphone.
2. Sur le PC :

```bash
npm install
npm run go            # même réseau Wi-Fi que le téléphone
# ou si le téléphone n'est pas sur le même Wi-Fi :
npm run go:tunnel     # passe par un tunnel ngrok
```

3. Scannez le **QR code** affiché dans le terminal (Android : directement
   depuis Expo Go → « Scan QR code »).

L'app démarre immédiatement : onboarding, conversation locale, mémoire,
bibliothèque RAG, entraînement, arène, compagnon — tout fonctionne hors ligne.

**Ce qui change en mode Expo Go** (signalé dans l'écran Confidentialité) :
`react-native-quick-crypto` et `llama.rn` sont des modules natifs absents
d'Expo Go. L'app bascule alors automatiquement sur un repli JS pur — SHA-256
de vérification validé contre la référence (`npm run crypto:check`) — et le
chiffrement au repos des données de test est désactivé. Dans la version
installée (build de développement ou `.aab`), ces deux modules sont compilés :
chiffrement AES-256-GCM complet et vrais poids GGUF.

## Ce qui est réel dans cette V1

- **Aucun compte, aucune donnée collectée** : il n'existe aucun écran de création de
  compte ni de connexion — l'app n'a besoin d'aucune information (ADR-002). Le menu
  Compte a été supprimé ; la Confidentialité liste tout ce qui reste sur l'appareil.
- **Modèles réels** : le catalogue de l'écran Modèles pointe vers de vrais fichiers
  GGUF officiels sur Hugging Face (Qwen 2.5 0.5B / 1.5B, SmolLM2 1.7B — Apache-2.0),
  avec taille exacte et empreinte SHA-256 du fichier publié. Le téléchargement est
  réel, la vérification (taille + SHA-256 en flux) est réelle, et un checksum invalide
  supprime le fichier.
- **Vraie inférence sur l'appareil** : les poids téléchargés sont chargés par
  `llama.rn` (llama.cpp) dans la version installée (build de développement ou .aab).
- **Appareil réel** : nom de l'appareil, OS, mémoire, stockage libre (expo-device +
  file-system), niveau de batterie pendant l'entraînement (expo-battery).
- **Bibliothèque réelle** : import de fichiers texte du téléphone (expo-document-picker :
  .txt, .md, .csv, .json…), indexation locale, RAG avec citations ; création de notes.
- **Mìmir dans les autres applis** : dans la version installée, une bulle système
  glissable reste par-dessus toutes vos applis (module natif `modules/mimir-overlay/`
  : permission « Afficher par-dessus », service avant-plan discret, notification
  permanente). Toucher la bulle ouvre l'assistant directement (deep link
  `mimai://assistant`). Activation : Mìmir → « Par-dessus les autres applis ».
  **Fonction optionnelle à la compilation** : la politique Google Play encadre
  `SYSTEM_ALERT_WINDOW`, donc le profil EAS `production` compile **sans** bulle
  (`MIMAI_OVERLAY=0`) et `production-overlay` l'inclut. Voir `docs/PLAY_STORE_CHECKLIST.md`.

### Limites connues (exactitude)

- **Dans Expo Go** : les modules natifs `llama.rn` et `quick-crypto` ne peuvent pas
  être chargés (contrainte d'Expo Go, pas du projet). L'app bascule sur son moteur
  intégré (réponses construites localement à partir de la mémoire, du RAG et des
  exemples) et sur le SHA-256 JS validé. C'est le mode « maquette fonctionnelle » :
  tout le parcours est testable, mais le LLM qui répond n'est pas le GGUF.
- **Dans la version installée (.aab)** : `llama.rn` charge les poids et répond
  réellement ; chiffrement AES-256-GCM complet ; bulle par-dessus les autres
  applis uniquement dans la variante compilée avec l'overlay. Le réveil vocal
  n'est pas implémenté.
- L'extraction PDF/DOCX dans la bibliothèque demande aussi un module natif — en V1,
  importez du texte ou collez vos notes.
- Le fine-tune LoRA natif reste la phase 4 ; les « compétences » V1 sont des profils
  de personnalisation appliqués à l'inférence, versionnés et validés (benchmark +
  rollback), comme documenté plus bas.

## Build Android

Le dossier `android/` est **généré** (`expo prebuild`, ignoré par git) : toute
configuration native durable est dans `app.json` et `plugins/withMimaiAndroid.js`.

```bash
npm install
npm run typecheck && npm run crypto:check && npm run test:training
npm run prebuild          # génère android/
npx expo run:android      # build + install sur appareil/émulateur branché
```

Fichier Play Store (`.aab`) :

```bash
eas build -p android --profile production            # cloud, signature gérée par EAS
npm run build:aab:local                              # local : variables MIMAI_UPLOAD_* requises
```

`app.json` : package `fr.mimai.app`, targetSdk/compileSdk 36, icônes (`npm run icons`),
`allowBackup=false`, HTTPS seul. Permissions du build de production :
**`INTERNET`** (téléchargement explicite d'un modèle) et `ACCESS_NETWORK_STATE`
(option « Wi-Fi seulement »). Le build avec bulle ajoute `SYSTEM_ALERT_WINDOW`,
`FOREGROUND_SERVICE`(+`_SPECIAL_USE`) et `POST_NOTIFICATIONS`. Détails, Data Safety et
étapes : [`docs/PLAY_STORE_CHECKLIST.md`](docs/PLAY_STORE_CHECKLIST.md) ;
[`PRIVACY.md`](PRIVACY.md), [`SECURITY.md`](SECURITY.md).

## Architecture (conforme au README §3-4)

```text
mimai-app/
├── App.tsx                    point d'entrée (polices, providers)
├── app.json                   configuration Expo/Android (aab)
├── src/
│   ├── theme.ts               tokens du design system Organic
│   ├── art.tsx                logo MiMai, Mìmir (60 animations), créatures
│   ├── ui.tsx                 composants (boutons pill, tags, cartes, nav…)
│   ├── state.tsx              état global + persistance
│   ├── nav.tsx / nav-types.ts pile de navigation (28 écrans)
│   ├── services/
│   │   ├── db.ts              SQLite (conversations, messages, memories,
│   │   │                      documents, training_*, adapters, settings,
│   │   │                      net_log, crashes) + chiffrement AES-256-GCM,
│   │   │                      clé dans SecureStore (= Android Keystore)
│   │   ├── net.ts             réseau DEFAULT DENY + fenêtre 15 min +
│   │   │                      pipeline download → taille → SHA-256 →
│   │   │                      manifeste → licence → install → re-blocage
│   │   ├── rag.ts             RAG local : chunks + recherche lexicale + résumé
│   │   ├── memory.ts          mémoire (apprentissage immédiat, §6)
│   │   ├── engine.ts          inférence : llama.rn (GGUF réel) si présent,
│   │   │                      sinon moteur local intégré — jamais de réseau
│   │   └── training.ts        dataset → entraînement → benchmark →
│   │                          activation/rollback (adaptateurs versionnés)
│   └── screens/               les 26 écrans des maquettes + Mémoire
└── scripts/make-icons.js      génération des icônes PNG (zlib pur)
```

## Conformité au cahier des charges (Definition of Done, §29)

| Exigence | Implémentation |
|---|---|
| Aucun serveur, aucun compte | Aucune dépendance backend ; aucun compte (ni facultatif, ni local) |
| Fonctionne hors ligne | Moteur local intégré + RAG + mémoire 100 % sur l'appareil |
| Réseau bloqué par défaut | `net.ts` : politique DEFAULT DENY, `fetch` global intercepté et journalisé |
| Téléchargement modèle = action explicite | Confirmation « Internet nécessaire, rien d'autre n'est envoyé », fenêtre 15 min |
| Vérification des modèles | Taille + SHA-256 (streaming, `react-native-quick-crypto`) + manifeste + licence ; checksum invalide ⇒ installation annulée |
| Retour automatique au mode bloqué | Dès la fin du téléchargement, puis `finally` ; expiration automatique à 15 min ; jamais restauré au redémarrage |
| Conversations → dataset local | Drapeau `TRAINING = YES/NO/MEMORY_ONLY` par conversation + corrections (👍/👎) |
| Mémoire ≠ entraînement | Écran Mémoire séparé ; l'entraînement produit des adaptateurs versionnés |
| Adaptateurs évalués avant activation | Benchmark style + capacités générales (anti catastrophic forgetting, §14) ; FAIL ⇒ refus |
| Rollback | `rollbackToPrevious()` réactive la version précédente |
| Suppression des données | Confidentialité → « Supprimer les données locales » (lignes effacées, base compactée) ; la suppression d'une conversation/document est aussi répercutée en base |
| Telemetry OFF | Zéro SDK d'analytics, zéro envoi ; diagnostic exporté manuellement |
| Permissions minimales | `INTERNET` (+ `ACCESS_NETWORK_STATE`) ; la bulle ajoute 4 permissions sensibles et est exclue du profil `production` |

### Modèles réels

Les modèles sont des **composants séparés** (ADR-004). Le catalogue de
`src/services/net.ts` (`MODELS`) contient l'URL Hugging Face, la taille exacte et le
SHA-256 de chaque GGUF ; le pipeline de téléchargement, de vérification et
d'installation est codé. Tant qu'aucun poids n'est installé, le moteur intégré
répond localement.

### Note ADR — adaptateur V1

Le fine-tune LoRA/QLoRA natif sur l'appareil est la phase 4 du roadmap.
En V1, un « adaptateur » est un profil de personnalisation structuré (règles
de style déduites des exemples, few-shots de corrections, mémoire) appliqué au
moment de l'inférence : il modifie réellement les réponses, est versionné
(v001, v002…), validé par benchmark avant activation et annulable — exactement
le cycle des maquettes. Le branchement d'un vrai fine-tune on-device se fera
dans `training.ts` sans changer les écrans ni le contrat de données.

## Publication Play Store

Voir [`docs/PLAY_STORE_CHECKLIST.md`](docs/PLAY_STORE_CHECKLIST.md) (fiche, Data Safety
« aucune donnée collectée », déclaration des permissions, build, tests sur appareil) et
[`PRIVACY.md`](PRIVACY.md) à publier sur une URL publique. Non fait à ce jour : test sur
appareil réel, clé d'upload, compte Play Console.
