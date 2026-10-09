# Checklist de publication Google Play — MiMai

Package : `fr.mimai.app` · versionName `1.0.0` · versionCode `1` (EAS l'incrémente à distance) · compileSdk/targetSdk **36** (Android 16) · minSdk 24 · format **AAB**.

## 0. Décision préalable : la bulle flottante (overlay)
`SYSTEM_ALERT_WINDOW` et `FOREGROUND_SERVICE_SPECIAL_USE` sont des permissions à risque pour la revue Google Play (déclaration + justification + vidéo). Le projet les rend **désactivables à la compilation** :

| Profil EAS | `MIMAI_OVERLAY` | Résultat |
|---|---|---|
| `production` (défaut) | `0` | Aucune de ces permissions ni le service dans le manifeste ; la fonction « Par-dessus les autres applis » est indisponible. **Recommandé pour la 1re publication.** |
| `production-overlay` | `1` | Bulle incluse ; déclarations Play obligatoires (section 3). |

Le mécanisme : `plugins/withMimaiAndroid.js` (retire permissions + service via `tools:node="remove"`) et `extra.overlayEnabled` lu par `src/services/overlay.ts`.

## 1. Fiche Play Console
- Icône 512×512 : `docs/store-assets/icon-512.png` (provisoire, à remplacer par le visuel final).
- Visuel de présentation 1024×500 : `docs/store-assets/feature-graphic-1024x500.png` (provisoire).
- Captures d'écran téléphone (min. 2, 16:9 ou 9:16) : à produire sur appareil.
- Titre (≤30) : « MiMai — IA privée sur votre téléphone ». Courte description (≤80) : « Un assistant IA qui tourne sur votre appareil. Aucun compte, aucun serveur. »
- Description longue : n'annoncer que ce qui est réel (voir README § « Ce qui est réel » et « Limites connues ») : pas de « fine-tuning sur appareil » ni de lecture d'écran.
- Catégorie : Productivité (ou Outils). Coordonnées : e-mail, site web.
- **Politique de confidentialité** : publier `PRIVACY.md` sur une URL publique et la saisir (obligatoire).
- Classification du contenu (IARC) : questionnaire ; l'IA générative sur appareil sans contenu en ligne.
- Public cible : 18+ recommandé (assistant IA génératif) ; pas d'application « famille ».
- Déclaration « fonctionnalité d'IA » : l'app utilise des modèles génératifs ; prévoir un moyen de signaler les contenus (retour 👎 + correction existent en local ; ajouter un contact support).

## 2. Sécurité des données (Data Safety) — réponses exactes
- **L'application collecte-t-elle ou partage-t-elle des données utilisateur requises ?** → **Non.**
  Justification : tout est traité et stocké sur l'appareil ; aucun envoi à l'éditeur ni à un tiers. Le téléchargement d'un modèle contacte `huggingface.co` sans y envoyer de données personnelles (l'adresse IP vue par ce serveur est une métadonnée de connexion standard ; Google considère comme « collecte » la donnée envoyée hors de l'appareil par l'app ou ses SDK — un simple téléchargement de fichier public sans identifiant n'en est pas une, mais gardez cette justification en cas de question de la revue).
- Toutes les catégories (localisation, infos perso, finances, santé, messages, photos, fichiers, contacts, activité, navigation, identifiants d'appareil, diagnostics) : **non collectées**.
- Chiffrement en transit : HTTPS uniquement (le seul trafic). Suppression des données : l'utilisateur les efface dans l'app (Confidentialité) ; pas de compte donc pas d'URL de suppression de compte.
- **Aucun SDK tiers de collecte** : à re-vérifier si des dépendances sont ajoutées (`npm ls`, manifeste fusionné).

## 3. Déclaration des autorisations (manifeste final)
| Permission | Présente | Justification |
|---|---|---|
| `INTERNET` | toujours | Téléchargement explicite d'un modèle (HTTPS, fenêtre 15 min, DEFAULT DENY). |
| `ACCESS_NETWORK_STATE` | toujours (ajoutée par `expo-network`, non dangereuse) | Refuser le téléchargement en données mobiles quand « Wi-Fi seulement » est actif. |
| `RECORD_AUDIO` | toujours (ajoutée par `expo-speech-recognition`) | Commande vocale : micro ouvert seulement à l'appui sur le bouton, reconnaissance **sur l'appareil** (`requiresOnDeviceRecognition`), jamais en continu. Data Safety : audio traité sur l'appareil, non collecté. |
| `VIBRATE` | toujours (ajoutée par `expo-haptics`, non dangereuse) | Retour haptique léger sur les boutons de feedback du chat. Aucune donnée collectée. |
| `SYSTEM_ALERT_WINDOW` | **overlay seulement** | Bulle flottante Mìmir au-dessus des autres applis, activée par l'utilisateur. |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE` | overlay seulement | Maintenir la bulle ; type `specialUse`, sous-type `assistant_bubble_overlay` (Android 14+). |
| `POST_NOTIFICATIONS` | overlay seulement | Notification obligatoire du service au premier plan. |
| Retirées volontairement | — | `READ/WRITE_EXTERNAL_STORAGE`, `ACCESS_WIFI_STATE`, `ACTIVITY_RECOGNITION` (ajoutée par expo-sensors, non utilisée), `USE_BIOMETRIC`, `USE_FINGERPRINT` (via `blockedPermissions`). |

Si `production-overlay` : remplir dans la Play Console **Contenu de l'application → Déclaration des services au premier plan** (type « Cas d'utilisation spécial », vidéo montrant l'activation et la bulle) et la **déclaration `SYSTEM_ALERT_WINDOW`** (fonction centrale, vidéo, justification d'absence d'alternative). Risque de refus réel : publier d'abord sans overlay.

## 4. Configuration technique vérifiée
- `allowBackup=false`, règles d'extraction vides, `usesCleartextTraffic=false`, `network_security_config` (HTTPS).
- R8/minification et réduction des ressources en release ; règles Proguard pour `llama.rn`, Nitro/quick-crypto et le module overlay.
- Icône adaptative avec zone sûre + icône monochrome (thème Android 13+).
- Signature release : jamais de clé debug ; clé d'upload via `MIMAI_UPLOAD_*` ou EAS.
- 16 Ko de taille de page (obligatoire pour les mises à jour ciblant Android 15+) : `llama.rn` compile avec `ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` ; **à contrôler sur l'AAB final** (`zipalign -c -P 16 -v 4 app.apk` sur un APK extrait via bundletool, ou l'analyse d'APK d'Android Studio).
- Architectures : arm64-v8a, armeabi-v7a, x86_64 (arm64 obligatoire côté Play).

## 5. Étapes de build

### Option A — EAS Build (recommandé, Play App Signing)
```bash
npm install -g eas-cli
eas login                      # compte Expo (action manuelle)
eas init                       # crée le projectId réel dans app.json (le faux ID a été retiré)
eas build -p android --profile production            # AAB sans bulle
# ou : --profile production-overlay                  # AAB avec bulle
```
EAS génère et conserve la clé d'upload ; à la première soumission Play, activez Play App Signing.

### Option B — build local
```bash
# Windows PowerShell
$env:MIMAI_UPLOAD_STORE_FILE="C:\chemin\upload.jks"; $env:MIMAI_UPLOAD_STORE_PASSWORD="..."
$env:MIMAI_UPLOAD_KEY_ALIAS="upload"; $env:MIMAI_UPLOAD_KEY_PASSWORD="..."
npm run build:aab:local        # prebuild --clean + gradlew bundleRelease (MIMAI_OVERLAY=0 par défaut)
```
Prérequis : JDK 17+ (21 OK), Android SDK 36 + build-tools 36, `ANDROID_HOME`. Sortie : `android/app/build/outputs/bundle/release/app-release.aab`.
Créer la clé d'upload (une seule fois, à sauvegarder hors dépôt) :
`keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`

## 6. Tests avant envoi
1. Installer l'AAB via bundletool ou la piste de test interne sur un **vrai appareil** (Android 12, 14 et 15/16 idéalement).
2. Mode avion : onboarding, conversation, mémoire, bibliothèque RAG, entraînement — tout hors ligne.
3. Réseau : vérifier la **tentative bloquée journalisée** (écran Confidentialité) ; installer un modèle → barre, taille, SHA-256, **re-blocage automatique** ; couper le Wi-Fi en cours de téléchargement → échec propre, fichier partiel supprimé, réseau re-bloqué.
4. « Wi-Fi seulement » actif + données mobiles → téléchargement refusé.
5. Redémarrer l'app : le réseau est bloqué (aucune autorisation ne survit).
6. Supprimer une conversation/document puis relancer : ils ne reviennent pas. « Supprimer les données locales » : base vide.
7. Vrai modèle GGUF chargé par `llama.rn` : première réponse, mémoire (RAM) sur appareil 4 Go, arrêt propre.
8. Variante overlay : demande de permission, bulle, notification, deep link `mimai://assistant`, retrait de la permission pendant que la bulle tourne (pas de crash).
9. Pre-launch report de la Play Console (robots) : lire les crashs.
10. Vérifier le manifeste fusionné de l'AAB (`bundletool dump manifest`) : permissions conformes au tableau de la section 3.

## 7. Après l'envoi
Piste « Test interne » → « Test fermé » (les comptes développeur personnels créés après nov. 2023 exigent 12 testeurs pendant 14 jours avant la production) → Production. Incrémenter `versionCode` à chaque envoi (automatique avec `autoIncrement` côté EAS).

## Blocages hors code
Compte développeur Play (frais uniques) · keystore/clé d'upload · URL publique de la politique de confidentialité · captures et textes de fiche · contact support · test sur appareil réel · vidéos de déclaration si overlay.
