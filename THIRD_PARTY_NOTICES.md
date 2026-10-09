# Composants tiers / Third-party notices

MiMai utilise les composants ci-dessous. Chacun reste soumis à **sa propre licence**, qui n'est pas remplacée par la
[`LICENSE`](LICENSE) de MiMai. Les textes complets figurent dans le dossier de chaque paquet (`node_modules/<paquet>/LICENSE`)
et dans l'application compilée. Les licences ci-dessous ont été lues dans les métadonnées des paquets installés ; vérifiez-les
avant toute distribution commerciale.

## Bibliothèques (installées via npm)

| Composant | Licence |
|---|---|
| React, React Native | MIT |
| Expo et modules `expo-*` (SDK 57) | MIT |
| `llama.rn` (liaison React Native de llama.cpp) | MIT |
| `expo-speech-recognition` | MIT |
| `react-native-webview` | MIT |
| `@react-navigation/*`, `react-native-svg`, `react-native-screens`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-quick-crypto`, `react-native-nitro-modules` | MIT |

Pour la liste complète et à jour : `npx license-checker --summary` (ou lire `node_modules/*/package.json`).

## Moteur d'inférence
- **llama.cpp** (ggml) — licence MIT, embarqué via `llama.rn`.

## Polices
- **Caprasimo** et **Figtree** — polices Google Fonts, publiées sous SIL Open Font License 1.1.

## Jeu intégré
- « La Garde des Étoiles » est une création du Titulaire. Il embarque **React 18.3.1** et **ReactDOM 18.3.1** (MIT).

## Modèles de langage (téléchargés par l'utilisateur, non inclus dans ce dépôt)
Le catalogue (`src/data/catalog.json`) renvoie vers des fichiers GGUF publiés sur Hugging Face. **Chaque modèle a sa licence**,
indiquée dans le catalogue (champ `license`) : Apache-2.0, MIT, Gemma, Llama 3.1 / 3.2, Qwen (dont « qwen-research »),
Falcon, LFM 1.0, EXAONE, GLM-4, NVIDIA Open Model License, etc. Certaines licences imposent des conditions (usage
commercial, mention, restrictions d'usage). L'utilisateur est responsable du respect de la licence du modèle qu'il choisit
de télécharger. MiMai n'est ni affilié ni approuvé par les éditeurs de ces modèles.

## Marques
Android et Google Play sont des marques de Google LLC ; Hugging Face, Expo, React et les noms des modèles appartiennent à
leurs propriétaires respectifs et ne sont cités qu'à titre d'identification.
