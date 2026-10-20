# Dépôt de sources statiques

Pour écrire ou modifier une source, voir [docs/sources.md](../docs/sources.md) : manifeste, bac à sable et méthodes à implémenter.

Les sources de ce dossier sont externes au bundle Expo. MangaRead, WEBTOON English/Français, Fanfox, WeebCentral et SushiScan s'ajoutent aux huit sources précédentes. Komga Demo utilise les identifiants publics du [serveur de démonstration Komga](https://komga.org/docs/introduction/) ; elle n'est pas un modèle de stockage d'identifiants privés. Pepper&Carrot analyse le HTML du [webcomic officiel](https://www.peppercarrot.com/en/webcomics/peppercarrot.html) avec cheerio intégré au bundle de cette source. Le contenu est proposé sous [licence CC BY 4.0](https://www.peppercarrot.com/en/license/index.html) ; l'application affiche le crédit de l'auteur dans la description. Asura Scans lit les fiches et chapitres publics de [asurascans.com](https://asurascans.com/) ; les chapitres sans images publiques ne sont pas accessibles par cette source. MangaBats lit les fiches et chapitres publics de [mangabats.com](https://www.mangabats.com/) ; sa recherche peut ne trouver que les titres exacts et les listes visibles lorsque le site bloque son point de recherche. MangaKakalot lit [mangakakalot.gg](https://www.mangakakalot.gg/) et utilise le miroir public MangaBats pour les fiches et pages que Cloudflare bloque sur son domaine principal. Flame Comics lit les mangas et chapitres publics de [flamecomics.xyz](https://flamecomics.xyz/) ; les romans restent exclus du lecteur d'images. MangaKatana lit les chapitres publics de [mangakatana.com](https://mangakatana.com/). MangaRead lit les chapitres publics de [mangaread.org](https://www.mangaread.org/). WEBTOON English et Français lisent les épisodes publics des [Originals WEBTOON](https://www.webtoons.com/en/originals) ; les épisodes réservés à l'application ne sont pas proposés. Fanfox lit les chapitres publics de [fanfox.net](https://fanfox.net/) via son site mobile. WeebCentral lit les chapitres publics de [weebcentral.com](https://weebcentral.com/). SushiScan lit les chapitres publics de [sushiscan.net](https://sushiscan.net/) en français. Les sources qui donnent accès à des catégories adultes sont déclarées `contentRating: adult` et signalées avant leur installation.

1. Modifier le `bundle.js` concerné si nécessaire.
2. Exécuter `node scripts/build-source-repo.mjs` depuis la racine du projet.
   Vérifier ensuite les empreintes avec `npm run sources:verify` et régénérer la page d'installation avec `npm run sources:page`. Le workflow GitHub Pages régénère également cette page à chaque déploiement à partir des manifestes présents.
3. Publier le contenu de `source-repo/` sur un hébergement HTTPS statique. Le workflow fourni déploie ce dossier sur GitHub Pages quand le dépôt est connecté à GitHub et que **Settings → Pages → Source: GitHub Actions** est activé.
4. Coller l'URL du dossier voulu dans l'onglet Sources de l'app.

Le fichier `manifest.json` contient le SHA-256 du bundle. L'app vérifie cette empreinte avant installation. Les extensions n'ont pas accès à la base SQLite ; leurs requêtes passent par le bridge `app.fetch` limité aux domaines déclarés.
Les sources transmettent les genres et la classification d'un titre lorsque le site les fournit. Les catégories explicitement adultes sont signalées comme sensibles ; « Ecchi » et « Mature » ne le sont pas à eux seuls, conformément à la règle de confidentialité de l'application. Les dates de chapitre viennent du site ; celles d'Asura Scans sont déduites de son temps relatif et sont donc approximatives.
Les sources HTML empaquetées publient les notices de leurs dépendances dans leurs fichiers `THIRD_PARTY_LICENSES.txt`.

Ce dossier est publié sur GitHub Pages depuis [Farontir/manga-reader](https://github.com/Farontir/manga-reader). URLs à coller dans **Sources → Installer une source** :

- MangaDex : `https://farontir.github.io/manga-reader/mangadex/`
- Komga Demo : `https://farontir.github.io/manga-reader/komga-demo/`
- Pepper&Carrot : `https://farontir.github.io/manga-reader/peppercarrot/`
- Asura Scans : `https://farontir.github.io/manga-reader/asurascans/`
- MangaBats : `https://farontir.github.io/manga-reader/mangabats/`
- MangaKakalot : `https://farontir.github.io/manga-reader/mangakakalot/`
- Flame Comics : `https://farontir.github.io/manga-reader/flamecomics/`
- MangaKatana : `https://farontir.github.io/manga-reader/mangakatana/`
- MangaRead : `https://farontir.github.io/manga-reader/mangaread/`
- WEBTOON English : `https://farontir.github.io/manga-reader/webtoon-en/`
- WEBTOON Français : `https://farontir.github.io/manga-reader/webtoon-fr/`
- Fanfox : `https://farontir.github.io/manga-reader/fanfox/`
- WeebCentral : `https://farontir.github.io/manga-reader/weebcentral/`
- SushiScan : `https://farontir.github.io/manga-reader/sushiscan/`
- Toonily : `https://farontir.github.io/manga-reader/toonily/`

Le workflow commite `status.json` sur `main` à chaque vérification : faire `git pull` avant de pousser.

`status.json` est l'endpoint de monitoring. Le workflow GitHub Actions `.github/workflows/source-health.yml` le renouvelle toutes les six heures quand ce dépôt est publié sur GitHub. L'app permet aussi une vérification directe depuis l'onglet Sources.

Respecter les conditions d'utilisation et les droits des fournisseurs de contenu. Cet exemple utilise l'API publique de MangaDex pour les métadonnées et les pages.
