# Plan de réalisation

## Finition du lecteur (septembre 2026)

1. Ajouter un cache disque borné pour les pages distantes : clé URL + en-têtes, index persistant, éviction des images les moins récemment utilisées. Les chapitres téléchargés restent hors de ce cache temporaire.
2. Précharger la page visible et N+1 sans bloquer l'affichage ; conserver la virtualisation de la liste et revenir à l'URL distante si une copie en cache devient illisible.
3. Ajouter des retours haptiques aux actions de lecture et d'import, puis vérifier TypeScript, format, lint, tests et export iOS. Chaque bloc cohérent fera l'objet d'un commit.

Les tailles du cache et le comportement mémoire devront encore être vérifiés sur iPhone réel.

1. [x] Recréer la base Expo, la navigation et le schéma SQLite. Toute donnée persistante passe par `db/`.
2. [x] Ajouter la bibliothèque et l'import local CBZ, puis un lecteur paginé/webtoon avec progression indépendante des sources.
3. [x] Ajouter AniList, la recherche, les sources externes installables et leur sandbox WebView.
4. [x] Ajouter le basculement de source, le suivi de santé, l'export/import et les téléchargements.
5. [x] Vérifier TypeScript, lint, tests de logique pure et génération du bundle iOS. Commit après chaque bloc cohérent.

Restent à valider : lecteur et import sur iPhone réel, fonctionnement de la sandbox WebView et des téléchargements en arrière-plan sur appareil, hébergement public des sources et soumission App Store. Les comptes et l'appareil de l'éditeur sont nécessaires pour les étapes de distribution.

Audit des dépendances : PostCSS a été fixé à une version corrigée dans `package.json`. `npm audit` signale encore `image-size@1.2.1` (dépendance de Metro, utilisée pendant la compilation des images) comme vulnérabilité haute. Metro SDK 54 attend son API fonctionnelle ; le passage forcé à la version majeure corrigée demanderait une validation de compatibilité supplémentaire. Aucun contenu de source distante n'est traité par Metro à l'exécution.

L'app est livrée sans source de contenu préinstallée. Les exemples de sources se trouvent hors du bundle applicatif.
