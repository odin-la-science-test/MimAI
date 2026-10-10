# MiMai — assistant IA 100 % sur l'appareil (Android)

> **Votre IA. Votre appareil. Vos données. Aucun serveur.**

MiMai est une application Android (Expo / React Native) qui fait tourner un vrai modèle de langage **sur le téléphone**,
sans compte, sans serveur et sans collecte de données. Le seul moment où elle touche Internet est le téléchargement,
explicitement demandé par l'utilisateur, d'un fichier de modèle.

© 2026 Ethan — studio MiMai. **Tous droits réservés.** Logiciel propriétaire : voir [Licence](#licence-et-propriété).

---

## Sommaire

1. [Ce que fait MiMai](#ce-que-fait-mimai)
2. [Comment ça marche](#comment-ça-marche)
3. [Démarrer](#démarrer)
4. [Compiler et publier](#compiler-et-publier)
5. [Structure du dépôt](#structure-du-dépôt)
6. [Tests](#tests)
7. [Limites connues (exactitude)](#limites-connues-exactitude)
8. [Licence et propriété](#licence-et-propriété)

---

## Ce que fait MiMai

| Fonction | En bref |
|---|---|
| **Discussion locale** | Chat avec un modèle GGUF exécuté sur l'appareil (llama.cpp via `llama.rn`). Page vierge au départ : aucun texte pré-écrit. Réponses affichées mot à mot, au rythme réel du modèle. |
| **Modes** | Rapide, Réflexion, Vision, Outils. |
| **Catalogue d'environ 100 modèles** | Choix adapté au téléphone (RAM, stockage) + « décisionnel » qui recommande un modèle selon la spécialité demandée (code, français, raisonnement…). |
| **Détecteur de modèles installés** | Retrouve les fichiers déjà présents sur le téléphone (taille exacte), ou importe un fichier (vérifié par SHA-256). |
| **Une IA par fonction** | Chaque fonction (Rapide, Réflexion, Outils, Vision) a son propre modèle. Le mode et le modèle sont **fixés à la création d'une discussion** : pour en changer, on ouvre une nouvelle discussion. |
| **Vision** | Joignez une photo : le modèle de vision (SmolVLM2 500M, Qwen 2.5 VL 3B ou Gemma 3 4B, chacun avec son module image « mmproj » vérifié par SHA-256) la décrit **sur l'appareil**. |
| **Mémoire** | Retient les préférences ; séparée de l'entraînement. |
| **Bibliothèque (RAG)** | Importez des textes ; MiMai les cite dans ses réponses. |
| **Apprentissage local** | Profil de style (niveau 1) et import d'un adaptateur LoRA entraîné sur PC (niveau 2), toujours évalués avant activation. |
| **Benchmarks avant / après** | Vitesse et qualité mesurées au début et à la fin de chaque entraînement, ou à la demande, puis comparées. |
| **Voix** | Commande vocale (reconnaissance sur l'appareil), lecture des réponses à voix haute, **choix de la voix** et du style (naturelle, posée, grave, aiguë, vive). |
| **L'étoile de Mìmir** | Dans la barre, l'étoile est un petit être avec des yeux et **156 animations** (12 familles : accueil, joie, réflexion, écoute, notifications, émotions, physique, couleurs, téléphone, moments, jeux, repos). Il vit seul près de la caméra, sans barre : un toucher ouvre la bulle de discussion ; ses états se lisent sur lui (écoute, réflexion, anneau de progression d'une tâche, pastille de notification). Les animations viennent de la maquette `assets/design/etoile-engine.js`, « cuites » par `npm run etoile:bake` en `etoile.json`. |
| **Puce dans la barre d'état** | Notification « mise à jour en direct » (Android 16, Samsung One UI 8) : une pastille près de la caméra, comme un lecteur de musique. Un toucher ouvre une **discussion flottante** ; on peut aussi écrire dans la notification ou toucher « Parler ». Une barre noire autour de la caméra est disponible en option. |
| **Jeu hors ligne** | « La Garde des Étoiles », jeu intégré, sans réseau. |
| **Confidentialité** | Aucune télémétrie, aucun compte ; données chiffrées au repos ; suppression complète en un geste. |

---

## Comment ça marche

### 1. Inférence (`src/services/engine.ts`)
- Les poids GGUF téléchargés sont chargés par `llama.rn` (CPU uniquement sur Android, 4 threads : les gros cœurs).
- Sans poids installés (ou dans Expo Go), un **moteur intégré** répond localement à partir de la mémoire, de la
  bibliothèque et des exemples. Il n'y a jamais d'appel réseau, dans aucun des deux cas.
- Le modèle est **préchauffé** au démarrage (chargement + prompt système) pour que la première question n'attende pas.

### 2. Plan de vitesse (`src/services/speedplan.ts`)
Objectif : question courte ≤ 5 s, moyenne ≤ 10 s, réflexion ≤ 20 s.
- Chaque demande est classée (court / moyen / réflexion).
- La **longueur de réponse** est calculée d'après la vitesse (jetons/s) réellement mesurée du modèle sur ce téléphone,
  et une consigne de longueur est ajoutée à la question. Le prompt système reste identique d'une demande à l'autre
  (le moteur peut réutiliser son début).
- À l'échéance, la génération est **arrêtée** et la réponse coupée à la dernière phrase complète.
- Les questions courtes envoient moins d'historique et d'exemples (prompt plus petit = plus rapide).
- En mode Réflexion, la « réflexion cachée » des modèles hybrides est désactivée (elle ne peut pas être bornée par un
  délai) : le raisonnement est demandé en étapes courtes visibles.
- Le délai est une **garantie par coupure**, pas par magie : un modèle trop lent pour le téléphone verra ses réponses coupées.
  Le benchmark indique si l'objectif est atteint.

### 3. Modèles (`src/data/catalog.json`, `src/services/{catalog,fit,advisor,installed,modelFiles}.ts`)
- Chaque modèle du catalogue a une URL Hugging Face, une **taille exacte** et une empreinte **SHA-256**.
- Le téléchargement fonctionne sur tout réseau ; il est vérifié (taille + SHA-256 en flux, natif) ; une empreinte
  invalide supprime le fichier.
- `fit.ts` estime l'adéquation au téléphone (RAM, disque) ; `advisor.ts` classe les modèles par spécialité.
- `installed.ts` réconcilie la liste des modèles avec les fichiers réellement présents au démarrage.

### 4. Réseau « refus par défaut » (`src/services/net.ts`)
Le réseau est bloqué au démarrage, jamais restauré après un redémarrage. Un téléchargement ouvre une fenêtre
limitée, journalisée, puis le blocage revient. `fetch` global est intercepté.

### 5. Données (`src/services/db.ts`, `crypto.ts`)
SQLite local ; textes sensibles chiffrés (AES-256-GCM, clé dans le Keystore Android via SecureStore). Les lignes
supprimées sont écrasées (`secure_delete`). Les instantanés de benchmark ne contiennent que des chiffres.

### 6. Apprentissage et benchmarks (`training.ts`, `bench.ts`, `lora.ts`)
- **Niveau 1 — profil de style** : les exemples et corrections les plus proches de la question, plus des règles de
  style, sont ajoutés au prompt. **Les poids du modèle ne changent pas.**
- **Niveau 2 — LoRA** : un adaptateur GGUF entraîné sur PC (voir `scripts/train-lora-pc.md`) est importé, vérifié
  (SHA-256, métadonnées, dimensions), chargé au-dessus du modèle de base, évalué puis activé ou refusé.
- **Entraînement des poids sur l'appareil : non disponible** (`llama.rn` n'expose pas cette fonction).
- Un entraînement prend une mesure **avant** et une mesure **après** : temps de réponse, jetons/s, premier mot,
  proximité de style, culture générale. Un adaptateur qui dégrade les capacités générales est refusé. Rollback possible.

### 7. Voix (`voice.ts`, `speak.ts`)
Reconnaissance vocale **sur l'appareil** uniquement. Lecture par la synthèse vocale d'Android : MiMai liste les voix
françaises installées et applique le style choisi. Réserve : si l'utilisateur choisit dans Android une voix « réseau »,
c'est le moteur système, pas MiMai, qui peut utiliser Internet.

### 8. Barre de la caméra et discussion flottante (`modules/mimir-overlay`, `src/OverlayChat.tsx`)
Module natif Kotlin : service au premier plan + fenêtre « par-dessus les autres applis ». La barre se place sur
l'encoche réelle de l'écran (Android 11+), disparaît en paysage. Un toucher ouvre une fenêtre de discussion ; les
messages sont envoyés au moteur de l'app (JavaScript) qui répond en direct. Fonction **optionnelle à la compilation**
(politique Google Play sur `SYSTEM_ALERT_WINDOW`) : voir `docs/PLAY_DECLARATION_BULLE.md`.

### 9. Jeu (`assets/games/`, `scripts/embed-game.mjs`, `src/screens/game.tsx`)
Le jeu HTML est embarqué dans une WebView verrouillée par une CSP **sans aucun accès réseau** (React et ReactDOM
inclus). La progression reste dans la WebView. Des tests vérifient l'absence d'appel réseau.

---

## Démarrer

```bash
npm install
npm run go          # Expo Go (modules natifs absents : repli sur le moteur intégré)
```

Expo Go est une maquette fonctionnelle : `llama.rn`, la bulle, la voix et le chiffrement natif exigent la version installée.

## Compiler et publier

Le dossier `android/` est généré (`expo prebuild`) et ignoré par git. La configuration native durable est dans
`app.json` et `plugins/withMimaiAndroid.js`.

Sous Windows (chemins longs), le script central compile dans `C:\mm` :

```powershell
$env:MIMAI_UPLOAD_STORE_FILE="C:\chemin\mimai-upload.jks"
$env:MIMAI_UPLOAD_STORE_PASSWORD="<mot de passe>"
$env:MIMAI_UPLOAD_KEY_ALIAS="<alias>"
$env:MIMAI_UPLOAD_KEY_PASSWORD="<mot de passe>"
.\scripts\build-short.ps1 -Target aab-bubble   # AAB avec la barre ; -Target aab = sans ; -Target apk -Install = test câble
```

Le `versionCode` d'`app.json` doit être **inédit** à chaque envoi sur Play. Ne jamais versionner la clé de signature ni ses mots de passe.
Publication : `docs/TUTO_PLAY_STORE.md`, `docs/PLAY_STORE_CHECKLIST.md`, `docs/STORE_LISTING.md`, `PRIVACY.md`.

## Structure du dépôt

```text
App.tsx, app.json          point d'entrée, configuration Expo/Android
src/
  state.tsx                état global et actions (chat, modèles, benchmarks…)
  screens/                 écrans (chat, modèles, entraînement, compagnon, jeu…)
  services/                engine, speedplan, bench, training, lora, net, db, crypto, rag, memory,
                           catalog, fit, advisor, installed, voice, speak, overlay
  OverlayChat.tsx          réponses de la discussion flottante
  data/catalog.json        catalogue de modèles (taille + SHA-256)
modules/mimir-overlay/     module natif Android (barre, discussion flottante, SHA-256 natif)
plugins/                   plugin de configuration native
assets/games/              jeu embarqué (source) ; src/games/ = version générée
scripts/                   build, génération du catalogue/jeu, tests
docs/                      Play Store, confidentialité, déclarations
```

## Tests

```bash
npm run typecheck
npm run test:training test:speed test:fit test:advisor test:speak test:installed test:game test:gameai test:motion test:shake
npm run catalog:check
```
(à lancer un par un : `npm run test:speed`, etc.)

## Limites connues (exactitude)

- **Non testé sur téléphone réel à ce jour** : la barre, la discussion flottante, les voix et les mesures de vitesse
  restent à valider sur appareil. Le code Kotlin est compilé par le build Android, pas par les tests Node.
- Les objectifs de 5/10/20 s dépendent du modèle et du téléphone ; au-delà, la réponse est coupée.
- Le réveil vocal permanent n'existe pas (batterie et vie privée).
- L'import PDF/DOCX n'est pas géré : textes et notes seulement.
- Pas d'entraînement des poids sur l'appareil (voir niveau 2 pour un LoRA externe).
- Les voix disponibles dépendent du moteur de synthèse du téléphone.

## Licence et propriété

Le code source, la marque et les créations de ce dépôt sont la propriété d'Ethan (studio MiMai). **Ce n'est pas un logiciel
libre** : la lecture du dépôt n'accorde aucun droit d'utilisation, de copie, de modification ou de redistribution.
Voir [`LICENSE`](LICENSE). Les composants tiers (React Native, Expo, llama.cpp / `llama.rn`, polices, modèles de langage)
restent sous leurs propres licences : voir [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
