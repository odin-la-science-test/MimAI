# Politique de confidentialité — MiMai

*Dernière mise à jour : 4 octobre 2026. Version française d'abord, English version below.*

> **Avant publication :** cette page doit être publiée sur une URL publique (ex. GitHub Pages) et son lien saisi dans la Play Console.

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

### Ce qui est envoyé sur Internet
Le réseau est **bloqué par défaut**. Une seule opération l'ouvre, uniquement après votre action explicite : le **téléchargement d'un modèle d'IA** (fichier GGUF public) depuis `huggingface.co` (Hugging Face, Inc.). La fenêtre réseau dure 15 minutes au maximum et se referme dès la fin du téléchargement.

- Aucune donnée personnelle, aucun contenu de conversation ni aucun document n'est envoyé.
- Comme toute requête Internet, le serveur de téléchargement voit votre **adresse IP** et les informations techniques standard de la connexion. Ces informations sont traitées par Hugging Face selon sa propre politique ; MiMai ne les reçoit pas.
- Le fichier téléchargé est vérifié (taille et empreinte SHA-256) avant utilisation.

### Autorisations Android
- **Internet** : uniquement pour le téléchargement explicite d'un modèle.
- **Vibration** : retour haptique léger sur certains boutons. Aucune donnée n'est collectée.
- **Micro** : uniquement quand vous touchez le bouton micro (commande vocale). La reconnaissance se fait **sur votre appareil** avec le service vocal d'Android ; MiMai refuse de la faire par Internet. L'audio n'est ni enregistré ni envoyé par MiMai ; seul le texte reconnu est utilisé, comme si vous l'aviez tapé. Le micro n'écoute jamais en continu.
- **Jeu « La Garde des Étoiles »** : jeu intégré qui fonctionne entièrement **hors ligne** dans l'application (affichage par la WebView d'Android, sans accès réseau). Il ne demande aucune autorisation supplémentaire et n'envoie rien. Sa progression (étoiles, sorts) est conservée **sur votre appareil** et est effacée avec « Supprimer les données locales ».
- **Lecture à voix haute** (option « Réponses vocales », désactivée par défaut) : MiMai confie le texte de ses réponses à la **synthèse vocale d'Android** de votre téléphone. MiMai n'envoie rien sur Internet ; si vous choisissez dans Android une voix « réseau », c'est ce moteur système (et non MiMai) qui peut utiliser Internet, selon sa propre politique.
- **Afficher par-dessus les autres applications**, **service au premier plan** et **notifications** : uniquement dans la variante de l'application qui inclut la « bulle Mìmir » ; ces autorisations sont demandées seulement si vous activez la bulle, qui n'affiche qu'un bouton flottant et **ne lit pas le contenu de l'écran**.
- L'application n'accède ni aux contacts, ni à la localisation, ni à l'appareil photo, ni au stockage général : les fichiers que vous importez passent par le sélecteur de fichiers du système.

### Enfants
MiMai ne collecte aucune donnée et n'est pas destinée à profiler des enfants. Tranche d'âge : tout public.

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

### What is sent over the Internet
The network is **blocked by default**. Only one operation opens it, and only after your explicit action: **downloading an AI model** (a public GGUF file) from `huggingface.co` (Hugging Face, Inc.). The network window lasts 15 minutes at most and closes as soon as the download ends.

- No personal data, conversation content or document is ever sent.
- Like any Internet request, the download server sees your **IP address** and standard connection metadata. This is handled by Hugging Face under its own policy; MiMai does not receive it.
- The downloaded file is verified (size and SHA-256) before use.

### Android permissions
- **Internet**: only for the explicit model download.
- **Vibration**: light haptic feedback on some buttons. No data is collected.
- **Microphone**: only when you tap the microphone button (voice command). Recognition runs **on your device** with Android's speech service; MiMai refuses to use network-based recognition. MiMai neither records nor sends the audio; only the recognised text is used, as if you had typed it. The microphone never listens continuously.
- **"La Garde des Étoiles" game**: a built-in game that runs entirely **offline** inside the app (rendered by Android's WebView, with network access blocked). It needs no extra permission and sends nothing. Its progress (stars, spells) is kept **on your device** and is erased with "Delete local data".
- **Read aloud** ("Voice replies" option, off by default): MiMai hands the text of its answers to your phone's **Android text-to-speech**. MiMai sends nothing over the Internet; if you pick a "network" voice in Android, it is that system engine (not MiMai) that may use the Internet, under its own policy.
- **Draw over other apps**, **foreground service** and **notifications**: only in the app variant that includes the "Mìmir bubble"; they are requested only if you turn the bubble on. It shows a floating button and **does not read screen content**.
- The app does not access contacts, location, camera or general storage: files you import go through the system file picker.

### Children
MiMai collects no data. Age range: everyone.

### Your rights (GDPR)
The publisher holds no data about you, so there is nothing to access, rectify or erase on its side: you keep full control on your device (deletion from within the app). Questions: cells-atlas@gmail.com.

### Changes
Any change to this policy will be published at this address with a new date.
