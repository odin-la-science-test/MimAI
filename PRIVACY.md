# Politique de confidentialité — MiMai

*Dernière mise à jour : 16 octobre 2026. Version française d'abord, English version below.*

## Français

### En bref
MiMai est une application d'assistant IA qui **fonctionne sur votre téléphone**. Il n'y a **ni compte, ni serveur MiMai, ni publicité, ni outil d'analyse, ni collecte de données**. L'éditeur ne reçoit aucune de vos données.

### Éditeur et contact
MiMai (développeur : Ethan) — cells-atlas@gmail.com.

### Données stockées sur votre appareil
Les éléments suivants sont créés par vous et **restent sur votre appareil** (base SQLite privée de l'application) :
conversations et messages, souvenirs (mémoire), documents que vous importez ou écrivez, exemples d'entraînement, profils/adaptateurs personnalisés, réglages, journal réseau et journal d'erreurs locaux.

- Les contenus sensibles sont **chiffrés au repos** (AES-256-GCM) ; la clé est conservée dans le Keystore Android et ne quitte pas l'appareil. *(Le chiffrement n'est actif que dans l'application installée, pas dans le mode de test Expo Go.)*
- La sauvegarde automatique Android et le transfert d'appareil sont **désactivés** pour ces données.
- Vous pouvez tout effacer depuis **Confidentialité → Supprimer les données locales**. Désinstaller l'application efface aussi toutes les données.
- Les **photos** que vous joignez à la fonction Vision sont copiées dans l'espace privé de l'application, analysées **sur l'appareil** par le modèle de vision, et supprimées avec la conversation ou lors de la suppression des données. Elles ne sont jamais envoyées. MiMai n'utilise pas la caméra et ne demande aucune permission photo (sélecteur de fichiers d'Android).
- Un **rapport de plantage** (appareil, erreurs techniques, étapes juste avant un problème) est conservé sur l'appareil pour vous aider à signaler un bug. Il ne contient ni conversation ni document. Il n'est jamais envoyé automatiquement : c'est vous qui le copiez ou le partagez, et vous pouvez l'effacer (Menu → Rapport de plantage).

### Ce qui est envoyé sur Internet
Le réseau est **bloqué par défaut**. Une seule opération l'ouvre, uniquement après votre action explicite : le **téléchargement d'un modèle d'IA** (fichier GGUF public) depuis `huggingface.co` (Hugging Face, Inc.). La fenêtre réseau dure 15 minutes au maximum et se referme dès la fin du téléchargement.

- Aucune donnée personnelle, aucun contenu de conversation ni aucun document n'est envoyé **lors de ce téléchargement**.
- Comme toute requête Internet, le serveur de téléchargement voit votre **adresse IP** et les informations techniques standard de la connexion. Ces informations sont traitées par Hugging Face selon sa propre politique ; MiMai ne les reçoit pas.
- Le fichier téléchargé est vérifié (taille et empreinte SHA-256) avant utilisation.

### IA en ligne gratuite (facultative, désactivée par défaut)
Dans **Menu → IA en ligne gratuite**, vous pouvez activer, après une confirmation, l'usage de modèles hébergés par des fournisseurs gratuits (Cerebras, Groq, Google Gemini, SambaNova, OpenRouter, Mistral AI, Cloudflare Workers AI). Cette fonction n'existe que si **vous** collez votre propre clé d'API : MiMai ne fournit aucune clé et n'a aucun serveur.

- Quand elle est active, le **texte de vos questions** (et l'historique récent de la discussion) est envoyé directement de votre téléphone au fournisseur, sans passer par l'éditeur de MiMai. Votre **mémoire, vos documents et vos exemples d'entraînement** ne sont envoyés que si vous activez l'option « Mémoire, documents et exemples » ; vos **photos** (fonction Vision) ne sont envoyées que si vous activez « Photos ». Ces options sont désactivées par défaut.
- Chaque fournisseur traite ces données selon ses propres conditions (certains niveaux gratuits peuvent les utiliser pour améliorer leurs produits) ; il voit aussi votre adresse IP.
- Vos clés sont conservées dans le **coffre sécurisé Android** (Keystore), jamais dans la base de données, les sauvegardes ni les rapports. « Déconnecter » efface la clé.
- MiMai suit localement l'usage de chaque fournisseur (jetons, requêtes, limites du jour) et passe automatiquement de l'un à l'autre ; ce suivi reste sur l'appareil et ne contient aucun contenu de conversation.
- **Images et voix** : une demande de création (« génère une image de… », « fais un vocal… ») ou la lecture d'une réponse avec une **voix en ligne** envoie le texte concerné (description, texte à lire) au fournisseur (Cloudflare ou Google). Les images et sons créés sont enregistrés dans l'espace privé de l'application ; les sons de lecture sont effacés après usage. La voix du téléphone, elle, ne quitte pas l'appareil.
- **Documents et photos joints à une discussion** : ils sont lus **sur l'appareil** (texte, Word, Excel, PowerPoint, PDF). En mode en ligne, le contenu du document joint est envoyé au fournisseur avec votre question (c'est le but de la pièce jointe) ; une photo n'est envoyée que si l'option « Photos » est activée. Un PDF scanné peut être lu par Google Gemini si vous l'avez connecté.
- **Dictée vocale** : hors ligne, la reconnaissance se fait sur l'appareil. En mode en ligne, le service de reconnaissance vocale du téléphone (Google) peut utiliser Internet : l'audio est alors traité par ce service.
- **Perte d'Internet** : l'app détecte la connexion ; sans Internet, le mode en ligne est suspendu et le modèle du téléphone reprend la main.
- Tant que l'IA en ligne est active, seuls les modèles en ligne répondent : le modèle du téléphone ne prend pas le relais en silence. Si l'IA en ligne est désactivée, tout est traité sur l'appareil.

### Autorisations Android
- **Internet** : pour le téléchargement explicite d'un modèle et, si vous l'activez, pour l'IA en ligne gratuite.
- **Vibration** : retour haptique léger sur certains boutons. Aucune donnée n'est collectée.
- **Micro** : uniquement quand vous touchez le bouton micro (commande vocale ou dictée dans la bulle). Hors ligne, la reconnaissance se fait **sur votre appareil** avec le service vocal d'Android ; MiMai refuse de la faire par Internet. En mode en ligne, le service de reconnaissance de votre téléphone (Google) peut utiliser Internet. L'audio n'est ni enregistré ni envoyé par MiMai ; seul le texte reconnu est utilisé, comme si vous l'aviez tapé. Le micro n'écoute jamais en continu.
- **Lecture à voix haute** (option « Réponses vocales », désactivée par défaut) : MiMai confie le texte de ses réponses à la **synthèse vocale d'Android** de votre téléphone. MiMai n'envoie rien sur Internet ; si vous choisissez dans Android une voix « réseau », c'est ce moteur système (et non MiMai) qui peut utiliser Internet, selon sa propre politique.
- **Afficher par-dessus les autres applications**, **service au premier plan** et **notifications** : uniquement dans la variante de l'application qui inclut la « bulle Mìmir » ; ces autorisations sont demandées seulement si vous activez la bulle, qui n'affiche qu'un bouton flottant et **ne lit pas le contenu de l'écran**.
- L'application n'accède ni aux contacts, ni à la localisation, ni à l'appareil photo, ni au stockage général : les fichiers que vous importez passent par le sélecteur de fichiers du système.

### Enfants
MiMai (l'éditeur) ne collecte aucune donnée et n'est pas destinée à profiler des enfants. Tranche d'âge : tout public.

### Vos droits (RGPD)
L'éditeur ne détenant aucune donnée vous concernant, il n'y a rien à lui demander d'accéder, de rectifier ou d'effacer : vous gardez la maîtrise complète de vos données sur votre appareil (suppression depuis l'application). Pour toute question : cells-atlas@gmail.com.

### Modifications
Toute modification de cette politique sera publiée à cette adresse avec une nouvelle date.

---

## English

### Summary
MiMai is an AI assistant app that **runs on your phone**. There is **no account, no MiMai server, no ads, no analytics and no data collection**. The publisher receives none of your data.

### Publisher and contact
MiMai (developer: Ethan) — cells-atlas@gmail.com.

### Data stored on your device
Conversations and messages, memories, documents you import or write, training examples, custom profiles/adapters, settings, and local network and error logs are created by you and **stay on your device** (the app's private SQLite database).

- Sensitive content is **encrypted at rest** (AES-256-GCM); the key lives in the Android Keystore and never leaves the device. *(Encryption is only active in the installed app, not in the Expo Go test mode.)*
- Android auto-backup and device-to-device transfer are **disabled** for this data.
- You can erase everything from **Privacy → Delete local data**. Uninstalling the app also removes all data.
- **Photos** you attach to the Vision function are copied into the app's private storage, analysed **on the device** by the vision model, and deleted with the conversation or when you delete local data. They are never uploaded. MiMai does not use the camera and requests no photo permission (Android file picker).
- A **crash report** (device, technical errors, steps just before a problem) is kept on the device to help you report a bug. It contains no conversation or document. It is never sent automatically: you copy or share it yourself, and you can erase it (Menu → Crash report).

### What is sent over the Internet
The network is **blocked by default**. Only one operation opens it, and only after your explicit action: **downloading an AI model** (a public GGUF file) from `huggingface.co` (Hugging Face, Inc.). The network window lasts 15 minutes at most and closes as soon as the download ends.

- No personal data, conversation content or document is sent **during this download**.
- Like any Internet request, the download server sees your **IP address** and standard connection metadata. This is handled by Hugging Face under its own policy; MiMai does not receive it.
- The downloaded file is verified (size and SHA-256) before use.

### Free online AI (optional, off by default)
In **Menu → Free online AI** you can turn on, after a confirmation, models hosted by free providers (Cerebras, Groq, Google Gemini, SambaNova, OpenRouter, Mistral AI, Cloudflare Workers AI). This only exists if **you** paste your own API key: MiMai ships no key and runs no server.

- While it is on, the **text of your questions** (and the recent conversation history) is sent straight from your phone to the provider, never through the MiMai publisher. Your **memory, documents and training examples** are sent only if you turn on “Memory, documents and examples”; your **photos** (Vision) only if you turn on “Photos”. Both are off by default.
- Each provider processes the data under its own terms (some free tiers may use it to improve their products); it also sees your IP address.
- Your keys are kept in the **Android Keystore** secure storage, never in the database, backups or reports. “Disconnect” erases the key.
- MiMai tracks each provider's usage (tokens, requests, daily limits) on the device and switches between them automatically; this tracking contains no conversation content.
- **Images and voice clips**: a creation request (“generate an image of…”, “make a voice clip…”) sends the description or text to the provider (Cloudflare or Google). Images created are stored in the app's private space.
- **Documents and photos attached to a conversation** are read **on the device** (text, Word, Excel, PowerPoint, PDF). In online mode, the content of the attached document is sent to the provider with your question (that is the point of attaching it); a photo is sent only if “Photos” is on. A scanned PDF may be read by Google Gemini if you connected it.
- **Voice dictation**: offline, recognition runs on the device. In online mode, your phone's speech recognition service (Google) may use the Internet; the audio is then handled by that service.
- **Loss of Internet**: the app detects the connection; without Internet, online mode is suspended and the on-device model takes over.
- While online AI is on, only online models answer: the on-device model does not silently take over. If it is off, everything is processed on the device.
- **Backup**: the export file you create (Privacy → Backup) contains your conversations, memory, documents and examples, unencrypted, and goes only where you send it.

### Android permissions
- **Internet**: for the explicit model download and, if you turn it on, for the free online AI.
- **Vibration**: light haptic feedback on some buttons. No data is collected.
- **Microphone**: only when you tap the microphone button (voice command or dictation in the bubble). Offline, recognition runs **on your device** with Android's speech service and MiMai refuses to use network recognition. In online mode, your phone's speech recognition service (Google) may use the Internet.
- **Read aloud** ("Voice replies" option, off by default): MiMai hands the text of its answers to your phone's **Android text-to-speech**. MiMai sends nothing over the Internet; if you pick a "network" voice in Android, it is that system engine (not MiMai) that may use the Internet, under its own policy.
- **Draw over other apps**, **foreground service** and **notifications**: only in the app variant that includes the "Mìmir bubble"; they are requested only if you turn the bubble on. It shows a floating button and **does not read screen content**.
- The app does not access contacts, location, camera or general storage: files you import go through the system file picker.

### Children
MiMai collects no data. Age range: everyone.

### Your rights (GDPR)
The publisher holds no data about you, so there is nothing to access, rectify or erase on its side: you keep full control on your device (deletion from within the app). Questions: cells-atlas@gmail.com.

### Changes
Any change to this policy will be published at this address with a new date.
