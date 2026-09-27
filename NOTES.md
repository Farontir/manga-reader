# Plan de réalisation

## Import automatique des CBZ (septembre 2026)

iOS ne laisse lire que le dossier de l'app ou un dossier choisi par l'utilisateur. Étape 1, compatible Expo Go :

1. Mémoriser le dossier choisi via « Importer tous les CBZ d'un dossier » (table `settings`) et le rescanner au démarrage puis à chaque retour au premier plan (au plus une fois par minute).
2. Retenir chaque archive déjà traitée dans une nouvelle table `imported_archives` (migration 005, additive), identifiée par chemin relatif + taille : les scans suivants n'ouvrent que les nouveaux fichiers. Les CBZ d'origine ne sont jamais modifiés ni supprimés. Pas de clé étrangère : un manga supprimé de la bibliothèque ne revient pas au scan suivant.
3. expo-file-system ne conserve pas l'accès sécurisé au dossier après redémarrage : si la lecture échoue, la bibliothèque propose de rechoisir le dossier (sélecteur ouvert au même endroit).
4. Sérialiser tous les imports (manuel et automatique) pour éviter les doublons.

Étape 2, avec un build natif : scanner le dossier de l'app visible dans Fichiers (« Sur mon iPhone › Manga Reader ») et déclarer le type CBZ pour « Ouvrir avec ».

## Import CBZ dans Expo Go (septembre 2026)

1. Rendre l'action d'import de la bibliothèque lisible avec un bouton autonome à fort contraste.
2. Conserver le sélecteur de fichiers, mais permettre aussi de choisir le dossier parent du CBZ et de sélectionner l'archive dans une liste affichée par l'app. Ce parcours contourne les fichiers d'extension inconnue que Fichiers grise sur certains emplacements iOS.
3. Accepter `.cbz` et `.zip` contenant des images, vérifier les entrées avant import et valider TypeScript, lint, format, tests et bundle iOS. Recharger Expo Go et suivre Metro.

## Compatibilité Expo Go sur iPhone (septembre 2026)

L'Expo Go distribué sur l'App Store demande le SDK 57. Pour permettre les essais sans compte Apple Developer :

1. Migrer successivement les dépendances SDK 54 → 55 → 56 → 57, avec un commit par palier et vérification des changements de l'app.
2. Adapter le code et la configuration aux API actuelles, puis vérifier TypeScript, lint, tests, Expo Doctor et l'export iOS.
3. Démarrer explicitement en mode Expo Go et documenter la connexion au même compte Expo sur le PC et l'iPhone. Les tâches iOS en arrière-plan et la distribution resteront à valider dans un build natif ultérieur.

La modification préexistante de `.gitignore` sera conservée.

## Finition du lecteur (septembre 2026)

1. Ajouter un cache disque borné pour les pages distantes : clé URL + en-têtes, index persistant, éviction des images les moins récemment utilisées. Les chapitres téléchargés restent hors de ce cache temporaire.
2. Précharger la page visible et N+1 sans bloquer l'affichage ; conserver la virtualisation de la liste et revenir à l'URL distante si une copie en cache devient illisible.
3. Ajouter des retours haptiques aux actions de lecture et d'import, puis vérifier TypeScript, format, lint, tests et export iOS. Chaque bloc cohérent fera l'objet d'un commit.
4. Extraire les CBZ par morceaux, écrire chaque image directement sur disque et limiter le volume décompressé pour éviter de garder toutes les pages en mémoire.

Les tailles du cache et le comportement mémoire devront encore être vérifiés sur iPhone réel.

1. [x] Recréer la base Expo, la navigation et le schéma SQLite. Toute donnée persistante passe par `db/`.
2. [x] Ajouter la bibliothèque et l'import local CBZ, puis un lecteur paginé/webtoon avec progression indépendante des sources.
3. [x] Ajouter AniList, la recherche, les sources externes installables et leur sandbox WebView.
4. [x] Ajouter le basculement de source, le suivi de santé, l'export/import et les téléchargements.
5. [x] Vérifier TypeScript, lint, tests de logique pure et génération du bundle iOS. Commit après chaque bloc cohérent.

Restent à valider : lecteur et import sur iPhone réel, fonctionnement de la sandbox WebView et des téléchargements en arrière-plan sur appareil, hébergement public des sources et soumission App Store. Les comptes et l'appareil de l'éditeur sont nécessaires pour les étapes de distribution.

Audit des dépendances : PostCSS reste fixé à une version corrigée dans `package.json`. Après migration vers SDK 57, `npm audit --omit=dev` ne signale aucune vulnérabilité des dépendances de production. L'audit complet signale encore des vulnérabilités modérées dans les outils de développement ; leur correction demande une mise à jour dédiée.

L'app est livrée sans source de contenu préinstallée. Les exemples de sources se trouvent hors du bundle applicatif.
