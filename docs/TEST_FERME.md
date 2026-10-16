# Du test fermé à la publication — plan d'action (MiMai)

Règles vérifiées au 16 octobre 2026 dans mes connaissances ; **confirmez dans la Play Console** (elles évoluent). Pour un compte développeur
personnel créé après novembre 2023 : test fermé avec au moins **12 testeurs** pendant **14 jours consécutifs**, puis demande d'accès à la production.

## Étape 1 — Page de politique de confidentialité en ligne
1. `npm run privacy:page` (régénère `docs/privacy/index.html` depuis `PRIVACY.md`), puis commit et push.
2. GitHub → dépôt → **Settings → Pages** → Source : « Deploy from a branch » → branche `main`, dossier `/docs` → Save.
3. L'adresse sera `https://odin-la-science-test.github.io/MimAI/privacy/` (vérifiez-la dans la page Pages). Ouvrez-la sur votre téléphone.
4. Collez cette URL dans Play Console → Contenu de l'application → Politique de confidentialité.

## Étape 2 — Fiche et déclarations
- Textes : `docs/STORE_LISTING.md` (FR + EN). Titre 30 caractères max.
- Sécurité des données : `docs/DATA_SAFETY.md`.
- Bulle, service au premier plan, micro : `docs/PLAY_DECLARATION_BULLE.md` (justifications à coller + vidéo de démonstration).
- Classification du contenu, public cible, annonces (aucune), accès (aucun compte), catégorie : voir `docs/PLAY_STORE_CHECKLIST.md`.

## Étape 3 — Ressources visuelles à produire sur le téléphone (je ne peux pas les créer à votre place)
Icône 512 px et visuel 1024×500 : déjà générés (`docs/store-assets/`). **Captures d'écran** (téléphone, 2 minimum, 8 maximum), dans cet ordre :
1. Accueil orange, « Bonjour. Que voulez-vous faire ? ».
2. Une discussion avec une réponse et une pièce jointe (« ＋ Joindre »).
3. La bulle par-dessus une autre appli, avec le petit bonhomme orange.
4. Le même écran en mode en ligne (bleu) : bandeau « En ligne ».
5. Écran « IA en ligne gratuite » avec barres d'usage par fournisseur.
6. Atelier : une image créée.
7. Modèles : liste recommandée pour le téléphone.
8. Confidentialité : encadré « Mode en ligne actif : tout n'est PAS local » et section Sauvegarde.
Prenez-les en français, puis en anglais (Réglages → Confidentialité → Langue).

**Vidéo de présentation (30 à 60 s, YouTube « non répertorié »)** — plan : (1) Accueil orange 3 s ; (2) question écrite, réponse locale 8 s ;
(3) bonhomme glissé sur l'écran 5 s ; (4) appui de 3 secondes : il devient bleu, l'icône change 6 s ; (5) question en mode en ligne 8 s ;
(6) document joint puis résumé 10 s ; (7) écran Confidentialité 5 s. Pas de musique protégée.
**Vidéo pour les permissions sensibles** (bulle) : voir `docs/PLAY_DECLARATION_BULLE.md` (activation, demande Android, bulle par-dessus une autre appli).

## Étape 4 — Test fermé (14 jours)
1. Play Console → **Tests → Test fermé** → créer une piste → **Testeurs** : créez une liste (adresses Gmail) ou un Groupe Google (plus simple : tous les testeurs rejoignent le groupe).
2. Téléversez l'AAB (versionCode jamais utilisé) et envoyez à l'examen (quelques heures à 2 jours).
3. Envoyez à chaque testeur le **lien d'inscription** de la piste. Chacun doit : ouvrir le lien → **Devenir testeur** → installer depuis le Play Store.
4. Il faut **12 testeurs inscrits en même temps pendant 14 jours consécutifs** ; si l'un se désinscrit, le compteur peut être touché : visez 15 à 20.
5. Demandez-leur d'ouvrir l'app plusieurs fois, d'essayer le mode en ligne, et de signaler les problèmes (copie du rapport de plantage : Menu → Rapport de plantage).

Message type pour recruter : « Je publie MiMai, une IA qui fonctionne sur le téléphone. Peux-tu m'aider 14 jours ? 1) envoie-moi ton adresse Gmail 2) ouvre ce lien et clique sur *Devenir testeur* 3) installe l'app et ouvre-la de temps en temps. Merci ! »

## Étape 5 — Demander l'accès à la production
Au bout des 14 jours, le tableau de bord propose **« Demander l'accès à la production »** : questionnaire (comment vous avez recruté les testeurs, retours reçus,
corrections faites). Réponse en général sous quelques jours. Soyez concret : liste des bugs corrigés grâce aux testeurs.

## Étape 6 — Production
**Production → Créer une version** → même AAB (ou plus récent) → notes de version → examen. Publication par étapes recommandée (20 % puis 100 %).
Surveillez : Android vitals (plantages, ANR), avis, et les limites gratuites des fournisseurs (`src/services/cloud/providers.ts`).

## Rappels propres à MiMai
- Les fonctions bulle / micro / IA en ligne peuvent déclencher des questions de l'examinateur : gardez les justifications prêtes.
- En cas de refus pour la bulle : republier avec `-Target aab` (sans bulle) ; l'app reste complète.
- Incrémentez `versionCode` dans `app.json` à chaque envoi.
