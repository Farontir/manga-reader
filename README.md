# Manga Reader

Lecteur de manga iOS en React Native / Expo. La bibliothèque et la progression sont identifiées localement, indépendamment des sources installées. Désinstaller une source ne supprime ni les mangas ni l'historique.

## Démarrer

Prérequis : Node 20+, npm 10+, un iPhone avec Expo Go ou un build de développement.

```bash
npm install
npm start
```

Scanne le QR code avec l'iPhone. `expo-file-system`, `expo-document-picker`, SQLite et WebView font partie de l'environnement Expo Go SDK 54. Si Expo Go n'intègre pas un module natif de la version installée, utilise le build de développement EAS.

## Fonctions

- Import CBZ (jusqu'à 120 Mo compressés, extraction progressive) ou dossier d'images ; copie locale pour lecture hors ligne.
- Lecteur paginé ou webtoon, pinch zoom, double tap, reprise à la dernière page et suivi par **numéro de chapitre**. Les pages distantes sont préchargées autour de la page lue et conservées dans un cache temporaire LRU limité à 256 Mo.
- Recherche AniList et recherche dans les sources installées.
- Sources JavaScript externes via WebView isolée. L'installation vérifie le SHA-256 du bundle et limite `app.fetch` aux domaines du manifeste.
- Association automatique d'un manga aux sources avec ID AniList ou titre exact normalisé. Basculement sur une autre source liée si les pages échouent.
- Téléchargement de chapitres pour lecture hors ligne depuis la fiche manga. La file persistante reprend les pages manquantes après redémarrage ; sur iOS les transferts utilisent une session native en arrière-plan et une tâche planifiée peut reprendre la file.
- Export/import JSON de la bibliothèque, des liaisons, des chapitres connus et de la progression. Le partage iOS permet de l'enregistrer dans Fichiers/iCloud Drive.
- Vérification de santé et mise à jour des sources depuis l'app ; surveillance GitHub Actions avec endpoint `status.json`.

Les images locales et les téléchargements ne sont **pas** inclus dans la sauvegarde JSON ; ils doivent être réimportés ou retéléchargés sur un nouvel appareil. iOS décide du moment où la tâche planifiée peut s'exécuter ; la reprise en arrière-plan reste à valider sur un iPhone réel.

## Source d'exemple

L'app est livrée sans source préinstallée. `source-repo/` contient trois sources à héberger séparément : MangaDex, Komga Demo (API) et Pepper&Carrot (HTML avec cheerio). Komga Demo utilise les identifiants publics de son serveur de démonstration. Voir [leur guide](source-repo/README.md). Pour actualiser les empreintes après modification :

```bash
node scripts/build-source-repo.mjs
```

Le dépôt statique doit être accessible en HTTPS. Dans l'app, ouvre **Sources → Installer une source** et colle l'URL du dossier ou du `manifest.json`.

## Vérifications

```bash
npm run typecheck
npm run lint
npm test -- --pool=threads --maxWorkers=1 --no-file-parallelism
npm run format:check
npx expo export --platform ios
node scripts/smoke-mangadex.mjs
node scripts/smoke-komga.mjs
node scripts/smoke-peppercarrot.mjs
npm run sources:verify
```

## Build iOS

1. Choisis un identifiant de bundle unique et ajoute `ios.bundleIdentifier` dans `app.json`.
2. Connecte ton compte Expo avec `npx eas-cli login`, puis exécute `npx eas-cli init` pour créer `extra.eas.projectId`.
3. Lance `npx eas-cli build --profile development --platform ios` pour tester les modules natifs sur iPhone.
4. Pour TestFlight : `npx eas-cli build --profile preview --platform ios`.
5. Pour l'App Store : `npx eas-cli build --profile production --platform ios`, puis `npx eas-cli submit --profile production --platform ios`.

Le compte Apple Developer et les données de signature sont nécessaires pour les builds distribués. L'app n'a pas encore été validée sur un iPhone réel dans ce dépôt.

## Organisation

- `app/` : écrans Expo Router.
- `db/` : seule couche qui importe `expo-sqlite` et exécute du SQL. Connexion partagée, migrations additives et requêtes typées.
- `services/` : import local, AniList, matching, lecture, téléchargement et sauvegarde.
- `sources/` : contrat et installation des sources externes.
- `native-bridge/` : WebView sandbox et bridge HTTP.
- `ui/` : thème, composants et préférences du lecteur.
- `source-repo/` : exemple hébergeable séparément de l'app.

La vision et les phases initiales sont décrites dans [PROJECT.md](PROJECT.md). La confidentialité est décrite dans [PRIVACY.md](PRIVACY.md).
Les textes et les vérifications de soumission sont préparés dans [distribution/APP_STORE.md](distribution/APP_STORE.md).
Le parcours à valider sur un iPhone réel est détaillé dans [distribution/DEVICE_TESTS.md](distribution/DEVICE_TESTS.md).
