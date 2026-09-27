# Manga Reader

Lecteur de manga iOS en React Native / Expo. La bibliothèque et la progression sont identifiées localement, indépendamment des sources installées. Désinstaller une source ne supprime ni les mangas ni l'historique.

## Démarrer

Prérequis : Node 20+, npm 10+, un iPhone avec **Expo Go compatible SDK 57** et un compte Expo gratuit. Aucun compte Apple Developer n'est nécessaire pour ce parcours.

```bash
npm install
npx expo login
npm start
```

Connecte-toi au **même compte Expo** dans Expo Go sur l'iPhone, puis scanne le QR code affiché par `npm start`. Ce script force le mode Expo Go, même si `expo-dev-client` est installé. Le PC et l'iPhone doivent pouvoir communiquer sur le réseau local ; si le QR code ne se connecte pas, essaie `npm start -- --tunnel`.

Ce parcours gratuit permet de tester l'interface, l'import, la lecture, SQLite et les sources sur l'iPhone. Les tâches iOS planifiées en arrière-plan et le comportement d'un build distribué demandent une validation ultérieure dans un build natif. Expo Go affiche aussi son propre écran de démarrage, donc l'écran de démarrage final ne peut pas y être validé.

## Fonctions

- Import CBZ (jusqu'à 120 Mo compressés, extraction progressive) ou dossier d'images ; copie locale pour lecture hors ligne.

**Dossier surveillé.** L'écran d'import propose **Surveiller un dossier de CBZ** : choisis le dossier où tu ranges tes CBZ (iCloud Drive, Sur mon iPhone…), sous-dossiers compris. Il est rescanné au démarrage et à chaque retour dans l'app (au plus une fois par minute) ; seuls les nouveaux fichiers sont ouverts, les CBZ d'origine ne sont jamais modifiés. iOS retire souvent l'accès au dossier quand l'app est fermée : la bibliothèque affiche alors **Rechoisir**, qui rouvre le sélecteur au même endroit. Les fichiers iCloud non téléchargés sur l'iPhone sont signalés et ignorés. Ce parcours contourne aussi les `.cbz` grisés dans le sélecteur de fichiers.

La série, le tome et le chapitre viennent de `ComicInfo.xml` s'il est présent, sinon du nom du fichier (`One Piece T01.cbz`, `Naruto - Tome 5 - Chapitre 42.cbz`, `[Team] Titre - c1087 (v105).cbz`, `Titre 1087.cbz`…), sinon du nom du dossier parent (`One Piece/Chapter 12.cbz`).

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
3. Enregistre l'iPhone avec `npx eas-cli device:create`, puis lance `npx eas-cli build --profile development --platform ios` pour tester les modules natifs.
4. Pour une installation interne sans TestFlight : `npx eas-cli build --profile preview --platform ios` (les appareils doivent être enregistrés).
5. Pour TestFlight puis l'App Store : `npx eas-cli build --profile production --platform ios`, puis `npx eas-cli submit --profile production --platform ios`. Sélectionne ensuite le build dans App Store Connect pour TestFlight ou la revue App Store.

Le compte Apple Developer et les données de signature sont nécessaires pour les builds iOS distribués sur un iPhone. En attendant, utilise le parcours Expo Go ci-dessus. L'app n'a pas encore été validée sur un iPhone réel dans ce dépôt.

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
