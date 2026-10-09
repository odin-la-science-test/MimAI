# Tuto : de l'APK de test à la publication sur Google Play

Ordre conseillé : **A** (APK de test) → **B** (captures) → **C** (keystore) → **D** (compte Play) → **E** (fiche + publication).
Les écrans de la Play Console changent parfois : si un libellé diffère, cherche le mot-clé.

---

## A. Obtenir l'APK de test (pour les captures et pour tester l'IA)
1. Ouvre **PowerShell** (pas dans Claude).
2. Lance :
   ```powershell
   cd C:\Users\fcb1909-user\Desktop\Mimai\mimai-app
   .\scripts\build-test-apk.ps1
   ```
   Compte 20 à 40 min (compilation C++ de llama.rn). Ne ferme pas la fenêtre.
3. Résultat : `android\app\build\outputs\apk\release\app-release.apk`.
4. Si ça échoue : copie les 30 dernières lignes et envoie-les-moi.

## B. Installer l'APK et faire les captures d'écran
**Installer l'APK**
1. Envoie `app-release.apk` sur ton téléphone (câble USB, Drive, e-mail…).
2. Sur le téléphone, ouvre le fichier. Android demande d'autoriser l'installation depuis cette source : accepte (réglage temporaire).
3. Expo Go n'est pas à désinstaller : les deux coexistent, MiMai a son propre identifiant (`fr.mimai.app`).

**Préparer de belles captures**
1. Active le mode avion + Wi-Fi coupé : ça prouve le fonctionnement hors ligne (et la barre d'état est propre).
2. Installe un modèle (Réglages → Modèles → Qwen 2.5 0.5B) avant de couper le réseau.
3. Prépare 4 à 6 écrans : accueil, chat avec une vraie réponse, bibliothèque, mémoire, écran Confidentialité (réseau bloqué), Mìmir.
4. Capture avec **Volume bas + Marche/Arrêt**. Les images sont dans Galerie → Captures d'écran.

**Règles Google (à vérifier dans la console)**
- Téléphone : **2 à 8 captures**, PNG ou JPEG, côtés entre **320 et 3840 px**, rapport max 2:1.
- Déjà prêts dans `docs/store-assets/` : icône **512×512** et image de présentation **1024×500** (provisoires : à refaire si tu veux un rendu final).

## C. Créer le keystore de production (clé d'upload)
> C'est la clé qui prouve que c'est bien toi qui envoies les mises à jour. **Si tu la perds sans sauvegarde, tu devras demander une réinitialisation au support Google.** Ne la mets jamais dans un dépôt Git.

1. Crée un dossier hors du projet : `C:\Users\fcb1909-user\mimai-keys`.
2. Dans PowerShell :
   ```powershell
   & "C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot\bin\keytool.exe" -genkeypair -v -storetype PKCS12 `
     -keystore C:\Users\fcb1909-user\mimai-keys\mimai-upload.jks `
     -alias mimai-upload -keyalg RSA -keysize 2048 -validity 10000
   ```
3. Il te demande : un **mot de passe** (choisis-en un long), ton nom, organisation (`MiMai`), pays (`FR`). Valide avec `oui`.
4. **Note le mot de passe** dans un gestionnaire de mots de passe, et **copie le fichier `.jks` dans 2 endroits** (clé USB + cloud privé).
5. Pour compiler l'AAB signé en local :
   ```powershell
   $env:MIMAI_UPLOAD_STORE_FILE="C:\Users\fcb1909-user\mimai-keys\mimai-upload.jks"
   $env:MIMAI_UPLOAD_STORE_PASSWORD="<ton mot de passe>"
   $env:MIMAI_UPLOAD_KEY_ALIAS="mimai-upload"
   $env:MIMAI_UPLOAD_KEY_PASSWORD="<le même mot de passe>"
   cd C:\Users\fcb1909-user\Desktop\Mimai\mimai-app
   node scripts\build-aab-local.mjs
   ```
   Résultat : `android\app\build\outputs\bundle\release\app-release.aab`.
   (Variante sans PC : `eas build -p android --profile production` avec un compte Expo gratuit ; EAS gère alors la clé pour toi.)

## D. Créer le compte Google Play Console (25 $)
1. Va sur **play.google.com/console** et connecte-toi avec un compte Google (idéalement `cells-atlas@gmail.com`).
2. Choisis **compte personnel** (ou organisation si tu as une société et un numéro D-U-N-S).
3. Accepte l'accord développeur et **paie les 25 $** (paiement unique, carte bancaire).
4. **Vérification d'identité** : pièce d'identité officielle + justificatif demandé par Google, parfois un téléphone Android. Compte plusieurs jours pour la validation.
5. Renseigne le **nom de développeur public** : `MiMai` (ou « Ethan »). Il apparaît sur la fiche.
6. Compte personnel récent : Google impose en général un **test fermé avec au moins 12 testeurs pendant 14 jours** avant l'accès à la production. Vérifie la règle actuelle dans la console (Tableau de bord → « Accès à la production »). Prévois donc ~2 semaines.

## E. Créer l'application et publier
1. **Créer une application** : nom `MiMai`, langue par défaut français, type *Application*, *Gratuite*. Coche les déclarations.
2. **Politique de confidentialité** : colle l'URL publique de la page (voir `docs/privacy/index.html`, à héberger sur GitHub Pages).
3. **Contenu de l'application** (menu *Politique* → *Contenu de l'application*) :
   - Accès à l'application : *toutes les fonctionnalités sont accessibles sans compte*.
   - Publicités : *non*.
   - Classification du contenu : questionnaire → *Tout public*.
   - Public cible : *18+* ou *tout public* selon ton choix (cohérent avec la politique).
   - **Sécurité des données** : *aucune donnée collectée ni partagée* (voir `docs/STORE_LISTING.md`).
   - Si tu publies la variante avec la bulle : déclaration `SYSTEM_ALERT_WINDOW` et service au premier plan (vidéos exigées). **Conseil : publie d'abord sans la bulle** (profil `production`).
4. **Fiche principale** : colle les textes de `docs/STORE_LISTING.md`, ajoute l'icône 512, l'image 1024×500 et les captures.
5. **Test interne d'abord** : *Tests → Test interne → Créer une version* → envoie le `.aab` → ajoute ton adresse comme testeur → installe via le lien de test. Vérifie que tout marche (modèle, chat, hors ligne).
6. **Test fermé** (si la règle des 12 testeurs s'applique) puis **demande d'accès à la production**.
7. **Production** : *Production → Créer une version* → ajoute le `.aab` et les notes de version → envoie à la revue. La validation prend de quelques heures à plusieurs jours.
8. **Play App Signing** : accepte-le à la première importation. Google garde la clé de signature finale, ton keystore n'est que la clé d'upload.

## Pense-bête
- [ ] APK de test installé et testé sur ton téléphone (modèle téléchargé, réponse réelle, hors ligne).
- [ ] Keystore créé, mot de passe noté, 2 sauvegardes.
- [ ] Compte Play validé.
- [ ] URL de politique de confidentialité en ligne.
- [ ] Captures + icône + image de présentation prêtes.
- [ ] `.aab` de production compilé et signé.
