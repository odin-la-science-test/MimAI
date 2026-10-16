# Formulaire « Sécurité des données » (Play Console) — réponses proposées

Version du 16 octobre 2026. **À relire avec l'aide Google officielle avant de valider** : les définitions de « collecte » et de « partage » de Google
sont précises, et une réponse inexacte peut faire retirer l'app. Principe suivi ici : être prudent et déclarer ce que l'app peut envoyer.

## Ce que fait réellement l'app
- **Aucun serveur de MiMai.** L'éditeur ne reçoit aucune donnée.
- **Hors ligne (par défaut)** : rien ne quitte l'appareil. Le réseau ne sert qu'à télécharger un modèle (huggingface.co), sans donnée utilisateur.
- **Mode en ligne (facultatif, désactivé par défaut, confirmation avant activation)** : l'utilisateur colle sa propre clé ; l'app envoie **directement** à ce fournisseur tiers (Cerebras, Groq, Google, SambaNova, OpenRouter, Mistral AI, Cloudflare) :
  - le texte des questions et l'historique récent de la discussion ;
  - les **pièces jointes** que l'utilisateur ajoute à une discussion (texte extrait du document) ;
  - la **mémoire / bibliothèque / exemples** seulement si l'option est activée ; les **photos** seulement si l'option est activée ;
  - le texte à transformer en image ou en voix (Atelier).
- **Dictée vocale** : service de reconnaissance d'Android (Google) ; en mode en ligne il peut utiliser Internet. MiMai n'enregistre ni ne reçoit l'audio.

## Réponses proposées

| Question | Réponse |
|---|---|
| L'app collecte-t-elle ou partage-t-elle des données utilisateur ? | **Oui** (uniquement si l'utilisateur active le mode en ligne) |
| Toutes les données sont-elles chiffrées en transit ? | **Oui** (HTTPS uniquement ; le trafic en clair est interdit dans la configuration réseau) |
| Les utilisateurs peuvent-ils demander la suppression ? | **Oui** : « Confidentialité → Supprimer les données locales » efface tout sur l'appareil ; l'éditeur ne détient rien. La conservation chez le fournisseur dépend de ses conditions |

### Types de données à cocher (tous **« partagés »**, **facultatifs**, finalité **« Fonctionnalités de l'application »**, **non utilisés pour la publicité**)

| Catégorie Play | Type | Détail |
|---|---|---|
| Messages | Autres messages dans l'application | Questions et historique envoyés au fournisseur choisi |
| Fichiers et documents | Fichiers et documents | Documents joints à une discussion (texte extrait) |
| Photos et vidéos | Photos | Seulement avec l'option « Photos » du mode en ligne |
| Informations personnelles | (aucune) | Pas de nom, e-mail, identifiant |
| Localisation, contacts, finances, santé | (aucun) | — |
| Identifiants de l'appareil / publicité | (aucun) | Pas d'ID publicitaire, pas d'analytique |

Remarque « collecté » ou « partagé » : l'éditeur ne reçoit rien (donc pas de « collecte » par l'éditeur) ; l'envoi se fait par l'app vers un tiers choisi par
l'utilisateur, avec divulgation visible avant activation. Si, en relisant l'aide Google, ce transfert relève de l'exception « action initiée par
l'utilisateur », la déclaration peut être plus légère ; **en cas de doute, gardez la déclaration ci-dessus (la plus prudente).**

## Textes à cohérence (déjà alignés)
- Politique de confidentialité : `PRIVACY.md` / `docs/privacy/index.html` (section « IA en ligne gratuite »).
- Divulgation dans l'app : fenêtre « Activer l'IA en ligne ? » (écran IA en ligne gratuite) et bandeau « Mode en ligne actif : tout n'est PAS local » (Confidentialité).
- Fiche : `docs/STORE_LISTING.md`.

## Autres rubriques à remplir
- **Politique de confidentialité** : URL publique (voir `docs/TEST_FERME.md`, étape 1).
- **Public cible** : 13 ans et plus recommandé (contenu généré par IA) — à choisir ; l'app n'est pas destinée aux enfants.
- **Contenu généré par IA** : Google demande un moyen de signaler les contenus inappropriés : le bouton de retour d'expérience (pouce vers le bas) de chaque réponse sert à cela ; à mentionner.
- **Accès à l'app** : aucun compte ni identifiant requis.
- **Annonces** : aucune.
