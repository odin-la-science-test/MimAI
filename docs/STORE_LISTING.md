# Fiche Google Play — MiMai (brouillon à relire)

Textes à coller dans la Play Console. Chaque affirmation correspond à ce que l'app fait réellement dans le build natif (pas dans Expo Go).

## Français (fr-FR)

**Titre (30 max)** : MiMai — IA sur votre appareil

**Description courte (80 max)** : Une IA qui reste sur votre téléphone. Sans compte, sans serveur.

**Description complète**

MiMai est une application d'intelligence artificielle qui fonctionne sur votre appareil. Vos conversations, vos notes et vos documents ne quittent pas votre téléphone.

• Sans compte : aucune inscription, aucune adresse e-mail, aucun identifiant.
• Local par défaut : MiMai bloque son propre accès à Internet. Le réseau ne s'ouvre qu'à votre demande, pendant 15 minutes, pour télécharger un modèle d'IA.
• Modèles à la demande : vous choisissez et installez un modèle (Qwen 2.5, SmolLM2). Taille et empreinte SHA-256 sont vérifiées avant installation.
• Mémoire locale : MiMai retient vos préférences et vous pouvez les modifier ou les supprimer.
• Bibliothèque : importez des fichiers texte et interrogez-les, avec citation des passages.
• Personnalisation : corrigez les réponses, exportez votre jeu d'exemples, importez un adaptateur LoRA entraîné sur votre ordinateur. Chaque adaptateur est testé avant activation, et vous pouvez revenir en arrière.
• Commande vocale : touchez le micro pour parler à MiMai. La reconnaissance se fait sur l'appareil (Android 13 ou plus avec le pack de langue hors ligne), jamais par Internet. MiMai peut aussi lire ses réponses à voix haute (option, voix du téléphone).
• Jeu intégré « La Garde des Étoiles » : un jeu de stratégie avec Mìmir : lisez les faiblesses des créatures, combinez les éléments, campagne en chapitres et mode Épreuve. Entièrement hors ligne, sans publicité.
• Barre Mìmir (option) : une fine barre noire autour de la caméra, proposée une seule fois à l'installation, pour parler à MiMai depuis n'importe quelle application. Pas de personnage à l'écran ; elle ne lit pas l'écran et n'enregistre rien.
• Mìmir : un compagnon animé qui réagit quand vous secouez le téléphone.
• Pas de publicité, pas de statistiques, pas de pistage.

Limites à connaître : les modèles sont volumineux (de 0,5 à 1,1 Go) et la rapidité dépend de votre téléphone. L'extraction de PDF et DOCX n'est pas encore disponible : importez du texte.

## English (en-US)

**Title**: MiMai — On-device AI
**Short description**: AI that stays on your phone. No account, no server.
**Full description**: MiMai runs AI models on your device. Conversations, notes and documents never leave your phone. No account needed. MiMai blocks its own network access by default and opens it for 15 minutes only when you choose to download a model. Models are verified (size + SHA-256) before installation. Local memory, document library with citations, personalisation through corrections and LoRA adapters trained on your computer (each one tested before activation, with rollback). Voice command: tap the microphone to talk to MiMai; recognition runs on the device (Android 13+ with the offline language pack), never over the Internet. MiMai can also read its answers aloud (option, phone voice). Built-in game "La Garde des Étoiles": a strategy game with Mìmir: read creature weaknesses, combine elements, chaptered campaign and Trial mode. Fully offline, ad-free. Mìmir bar (optional): a thin black bar around the front camera, offered once at setup, to reach MiMai from any app; no character on screen, it does not read the screen. No ads, no analytics, no tracking. Models are large (0.5–1.1 GB); speed depends on your phone. PDF/DOCX extraction is not available yet.

## Data Safety (à vérifier avec le build final)

| Question | Réponse |
|---|---|
| Collecte de données | **Aucune** |
| Partage de données | **Aucun** |
| Données chiffrées en transit | Oui (téléchargement de modèle en HTTPS uniquement) |
| Suppression des données | Oui : Confidentialité → Supprimer les données locales |
| SDK tiers d'analyse ou de publicité | Aucun |
| Audio / voix | Micro utilisé seulement à l'appui sur le bouton ; reconnaissance **sur l'appareil**, audio ni enregistré ni transmis : non collecté |

Les téléchargements de modèles contactent huggingface.co : seul le fichier demandé est récupéré, aucune donnée de l'utilisateur n'est envoyée. À mentionner dans la politique de confidentialité.

## Autres déclarations
- Public : tout public ; aucune publicité ; pas d'achats intégrés ; pas de compte.
- Catégorie suggérée : Productivité (ou Outils).
- Permissions : `INTERNET` (téléchargement de modèles), `VIBRATE` (retour haptique), `RECORD_AUDIO` (commande vocale, micro ouvert uniquement à l'appui sur le bouton). Avec la bulle : `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE` + `POST_NOTIFICATIONS` (voir `PLAY_STORE_CHECKLIST.md`).
- Captures d'écran : à produire depuis le build installé (téléphone, 16:9 ou 9:16, 2 minimum).
