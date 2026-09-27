# Dépôt de sources statiques

`mangadex/`, `komga-demo/` et `peppercarrot/` sont trois sources externes. Elles ne sont pas incluses dans le bundle Expo. Komga Demo utilise les identifiants publics du [serveur de démonstration Komga](https://komga.org/docs/introduction/) ; elle n'est pas un modèle de stockage d'identifiants privés. Pepper&Carrot analyse le HTML du [webcomic officiel](https://www.peppercarrot.com/en/webcomics/peppercarrot.html) avec cheerio intégré au bundle de cette source. Le contenu est proposé sous [licence CC BY 4.0](https://www.peppercarrot.com/en/license/index.html) ; l'application affiche le crédit de l'auteur dans la description.

1. Modifier le `bundle.js` concerné si nécessaire.
2. Exécuter `node scripts/build-source-repo.mjs` depuis la racine du projet.
   Vérifier ensuite les trois empreintes avec `npm run sources:verify`.
3. Publier le contenu de `source-repo/` sur un hébergement HTTPS statique. Le workflow fourni déploie ce dossier sur GitHub Pages quand le dépôt est connecté à GitHub et que **Settings → Pages → Source: GitHub Actions** est activé.
4. Coller l'URL du dossier voulu dans l'onglet Sources de l'app.

Le fichier `manifest.json` contient le SHA-256 du bundle. L'app vérifie cette empreinte avant installation. Les extensions n'ont pas accès à la base SQLite ; leurs requêtes passent par le bridge `app.fetch` limité aux domaines déclarés.
La source Pepper&Carrot publie les notices de ses dépendances HTML dans `peppercarrot/THIRD_PARTY_LICENSES.txt`.

Ce dossier est publié sur GitHub Pages depuis [Farontir/manga-reader](https://github.com/Farontir/manga-reader). URLs à coller dans **Sources → Installer une source** :

- MangaDex : `https://farontir.github.io/manga-reader/mangadex/`
- Komga Demo : `https://farontir.github.io/manga-reader/komga-demo/`
- Pepper&Carrot : `https://farontir.github.io/manga-reader/peppercarrot/`

Le workflow commite `status.json` sur `main` à chaque vérification : faire `git pull` avant de pousser.

`status.json` est l'endpoint de monitoring. Le workflow GitHub Actions `.github/workflows/source-health.yml` le renouvelle toutes les six heures quand ce dépôt est publié sur GitHub. L'app permet aussi une vérification directe depuis l'onglet Sources.

Respecter les conditions d'utilisation et les droits des fournisseurs de contenu. Cet exemple utilise l'API publique de MangaDex pour les métadonnées et les pages.
