# Fiche Google Play — MiMai (version du 16 octobre 2026)

Textes à coller dans la Play Console. Chaque affirmation correspond à ce que l'app fait réellement dans le build natif (pas dans Expo Go).
Limites de la Play Console : titre 30 caractères, description courte 80, description complète 4 000.

## Français (fr-FR)

**Titre** : MiMai — IA sur votre appareil

**Description courte** : Une IA qui reste sur votre téléphone. Sans compte, sans serveur.

**Description complète**

MiMai est une application d'intelligence artificielle qui fonctionne sur votre appareil. Hors ligne, vos conversations, vos notes et vos documents ne quittent jamais votre téléphone.

DEUX MODES, DEUX COULEURS
• Orange = hors ligne : tout se passe sur votre téléphone.
• Bleu = en ligne (option) : vous branchez vos propres clés gratuites (Groq, Google Gemini, Cerebras, Cloudflare…) et MiMai passe tout seul d'un modèle à l'autre quand une limite du jour est atteinte. Désactivé tant que vous ne l'activez pas.
• Un appui de 3 secondes sur le petit bonhomme bascule d'un mode à l'autre. Sans Internet, MiMai repasse seul en hors ligne.

CE QUE VOUS POUVEZ FAIRE
• Discuter par écrit ou à la voix, avec des réponses lues à voix haute.
• Joindre un document ou une photo à une discussion : texte, Word, Excel, PowerPoint, PDF, images. Les fichiers sont lus sur votre téléphone.
• Créer des images et des voix avec vos fournisseurs en ligne (Atelier).
• Une bulle de discussion par-dessus n'importe quelle appli, avec un petit personnage animé que vous déplacez du doigt (option).
• Mémoire locale : MiMai retient vos préférences ; vous les modifiez ou les supprimez.
• Bibliothèque de documents avec citation des passages.
• Personnalisation : corrigez les réponses, importez un adaptateur LoRA entraîné sur votre ordinateur ; chaque adaptateur est testé avant activation.
• Sauvegarde et restauration de vos discussions, de votre mémoire et de vos documents pour changer de téléphone.
• Interface en français et en anglais.

VIE PRIVÉE
• Sans compte : aucune inscription, aucune adresse e-mail.
• Hors ligne, MiMai bloque son propre accès à Internet ; le réseau ne s'ouvre qu'à votre demande, 15 minutes, pour télécharger un modèle (taille et SHA-256 vérifiés).
• En mode en ligne, le texte de vos questions (et les pièces jointes que vous choisissez d'envoyer) part vers le fournisseur dont vous avez collé la clé ; rien ne passe par un serveur de MiMai. Vos clés sont dans le coffre sécurisé d'Android.
• Pas de publicité, pas de statistiques, pas de pistage.

Limites à connaître : les modèles sont volumineux (de 0,5 à 3 Go) et la rapidité dépend de votre téléphone. Les limites gratuites des fournisseurs en ligne changent. La génération de vidéo n'est pas disponible.

## English (en-US)

**Title**: MiMai — On-device AI

**Short description**: AI that stays on your phone. No account, no server.

**Full description**

MiMai is an AI app that runs on your device. Offline, your conversations, notes and documents never leave your phone.

TWO MODES, TWO COLORS
• Orange = offline: everything happens on your phone.
• Blue = online (optional): plug in your own free keys (Groq, Google Gemini, Cerebras, Cloudflare…) and MiMai switches models by itself when a daily limit is reached. Off until you turn it on.
• Hold the little character for 3 seconds to switch modes. With no Internet, MiMai goes back offline by itself.

WHAT YOU CAN DO
• Chat by typing or by voice, with answers read aloud.
• Attach a document or photo to a conversation: text, Word, Excel, PowerPoint, PDF, images. Files are read on your phone.
• Create images and voice clips with your online providers (Studio).
• A chat bubble over any app, with a small animated character you can drag with your finger (optional).
• Local memory: MiMai remembers your preferences; edit or delete them.
• Document library with cited passages.
• Personalization: correct answers, import a LoRA adapter trained on your computer; each adapter is tested before activation.
• Back up and restore your conversations, memory and documents to change phones.
• Interface in French and English.

PRIVACY
• No account: no sign-up, no e-mail address.
• Offline, MiMai blocks its own Internet access; the network opens only on your request, for 15 minutes, to download a model (size and SHA-256 verified).
• In online mode, the text of your questions (and the attachments you choose to send) goes to the provider whose key you pasted; nothing goes through a MiMai server. Your keys are kept in Android's secure storage.
• No ads, no analytics, no tracking.

Good to know: models are large (0.5 to 3 GB) and speed depends on your phone. Free tiers of online providers change. Video generation is not available.

## Sécurité des données (formulaire Play Console)

Voir `docs/DATA_SAFETY.md` : le mode en ligne facultatif change les réponses (des données sont envoyées à des tiers choisis par l'utilisateur).

## Autres déclarations
- Public : tout public ; aucune publicité ; pas d'achats intégrés ; pas de compte.
- Catégorie suggérée : Productivité (ou Outils).
- Permissions : `INTERNET`, `VIBRATE`, `RECORD_AUDIO` (dictée, micro ouvert uniquement à l'appui). Avec la bulle : `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE` (+ `SPECIAL_USE`), `POST_NOTIFICATIONS` (voir `docs/PLAY_DECLARATION_BULLE.md`).
- Captures d'écran et vidéo : voir `docs/TEST_FERME.md` (liste des plans à produire).
- Politique de confidentialité : URL publique de `docs/privacy/index.html` (voir `docs/TEST_FERME.md`).
