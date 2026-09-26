# Confidentialité — Manga Reader

Manga Reader ne demande pas de compte et ne collecte pas de données personnelles pour son propre compte.

- La bibliothèque, les fichiers importés, les téléchargements et la progression sont stockés sur l'appareil dans SQLite et dans le dossier privé de l'app. Les pages en ligne peuvent aussi être conservées temporairement dans un cache local limité à 256 Mo.
- Une recherche AniList envoie le texte recherché à l'API AniList.
- Une source tierce installée peut recevoir les recherches et les identifiants de manga que l'utilisateur choisit d'utiliser. Ses requêtes passent par l'app vers les domaines indiqués dans son manifeste.
- Les couvertures et les pages en ligne sont chargées depuis AniList ou les serveurs de la source choisie.
- L'export JSON est partagé seulement à la demande de l'utilisateur. Si l'utilisateur choisit iCloud Drive ou un autre service dans la feuille de partage iOS, ce service reçoit le fichier.

L'utilisateur peut supprimer les données d'un manga depuis sa fiche ou supprimer l'app pour effacer les données locales. Désinstaller une source conserve volontairement la bibliothèque et la progression.

Cette politique décrit le code du dépôt au 26 septembre 2026. Avant publication, renseigner le nom et le contact de l'éditeur, héberger cette politique à une URL publique et vérifier les pratiques de chaque source distribuée.
