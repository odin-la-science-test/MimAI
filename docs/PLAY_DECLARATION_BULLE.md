# Déclarations Google Play pour la bulle Mìmir (version « aab-bubble »)

La bulle utilise deux fonctions que Google contrôle : « afficher par-dessus les autres applis » (`SYSTEM_ALERT_WINDOW`)
et un service au premier plan (`FOREGROUND_SERVICE_SPECIAL_USE`). Un refus est possible : publie d'abord la version
sans bulle (`-Target aab`) si tu veux d'abord faire valider l'app.

## 1. Compiler
```powershell
.\scripts\build-short.ps1 -Target aab-bubble      # AAB avec bulle, pour Google Play
.\scripts\build-short.ps1 -Target apk             # APK avec bulle, pour l'installer par câble sur ton téléphone
```

## 2. Où déclarer (Play Console → Politique → Contenu de l'application)
1. **Autorisations de service au premier plan** (« Foreground service permissions »)
   - Type : **Cas d'utilisation spécial** (`specialUse`), sous-type `assistant_bubble_overlay`.
   - Description à coller :
     > MiMai affiche une notification permanente (puce dans la barre d'état, avec réponse rapide) et, en option, une fine barre noire autour de la caméra frontale, que l'utilisateur active lui-même dans l'application. Un service au premier plan est nécessaire pour maintenir cette barre visible au-dessus des autres applications (elle est masquée en paysage). Une notification permanente l'indique. Toucher la barre ouvre une petite fenêtre de discussion flottante (saisie de texte, réponses de l'assistant) ; un appui long lance la commande vocale. Le service ne lit pas l'écran, n'enregistre rien et n'accède pas au réseau.
   - **Vidéo** (lien YouTube non répertorié) montrant : l'écran Compagnon, l'activation du réglage, la demande de permission Android, la barre autour de la caméra par-dessus une autre application, la notification, puis la désactivation.
2. **Affichage par-dessus d'autres applications** (`SYSTEM_ALERT_WINDOW`)
   - Justification à coller :
     > La barre d'assistant autour de la caméra est la fonction centrale de l'application « Mìmir » : elle doit rester visible par-dessus les autres applications pour donner un accès immédiat à l'assistant. Il n'existe pas d'alternative équivalente (une notification ne permet pas un accès en un toucher avec une présence visuelle). La permission n'est demandée que lorsque l'utilisateur active la bulle, et elle peut être retirée à tout moment.
3. **Sécurité des données** : inchangée (aucune donnée collectée ni partagée).
4. **Politique de confidentialité** : déjà à jour (section « Autorisations Android »).

## 2 bis. Divulgation visible (obligatoire chez Google)
La version avec bulle affiche, à la fin de l'installation (écran « MiMai est prêt »), une carte « Mìmir à portée, discrètement » qui explique l'usage AVANT toute demande de permission : fine barre autour de la caméra par-dessus les autres applis, ne lit pas l'écran, n'enregistre rien, autorisation Android demandée une seule fois, retrait possible dans Compagnon. Joins une capture de cet écran à ta déclaration et montre-le dans la vidéo. La bulle n'est JAMAIS activée sans ce choix explicite (Android l'interdit de toute façon : l'autorisation « Afficher par-dessus » ne peut pas être accordée automatiquement).

## 3. Points que Google vérifie
- La bulle n'apparaît **que** si l'utilisateur l'active (c'est le cas : interrupteur dans Compagnon).
- Une notification permanente est visible tant que la bulle est affichée (c'est le cas).
- La barre ne lit pas le contenu de l'écran : elle est fine, à la hauteur de la caméra, masquée en paysage et sans zone de capture.
- Le service s'arrête quand l'utilisateur retire la bulle ou la permission.

## 4. Si Google refuse
Republie avec `-Target aab` (sans bulle) : la fonction est masquée proprement, et l'app reste complète.
