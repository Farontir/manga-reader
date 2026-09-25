# Plan de réalisation

1. [x] Recréer la base Expo, la navigation et le schéma SQLite. Toute donnée persistante passe par `db/`.
2. [x] Ajouter la bibliothèque et l'import local CBZ, puis un lecteur paginé/webtoon avec progression indépendante des sources.
3. [x] Ajouter AniList, la recherche, les sources externes installables et leur sandbox WebView.
4. [x] Ajouter le basculement de source, le suivi de santé, l'export/import et les téléchargements.
5. [x] Vérifier TypeScript, lint, tests de logique pure et génération du bundle iOS. Commit après chaque bloc cohérent.

Restent à valider : lecteur et import sur iPhone réel, fonctionnement de la sandbox WebView sur appareil, hébergement public des sources, téléchargement véritablement en arrière-plan, troisième source HTML et soumission App Store. Les comptes et l'appareil de l'éditeur sont nécessaires pour les étapes de distribution.

L'app est livrée sans source de contenu préinstallée. Les exemples de sources se trouvent hors du bundle applicatif.
