# Écrire une source

Une source est un petit programme JavaScript hébergé en dehors de l'app. Kumo Reader la
télécharge depuis une URL HTTPS, vérifie son empreinte, puis l'exécute dans un bac à sable.
Elle sert à trouver des mangas, lister leurs chapitres et donner les adresses des pages. La
bibliothèque, la progression et les téléchargements restent dans l'app : désinstaller une
source n'efface rien.

Ce document décrit ce que chaque source doit fournir. Les exemples complets sont dans
[`source-repo/`](../source-repo/) : `mangadex/` (API JSON, écrite directement en
`bundle.js`) et `peppercarrot/` (HTML analysé avec cheerio, écrite en `source.js` puis
empaquetée).

## 1. Fichiers d'une source

Chaque source a son dossier dans `source-repo/<nom>/` :

| Fichier                    | Rôle                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `manifest.base.json`       | Le manifeste écrit à la main, sans empreinte.                                                                      |
| `manifest.json`            | Généré : le manifeste avec le SHA-256 du bundle. Ne pas l'éditer.                                                  |
| `bundle.js`                | Le code exécuté par l'app : un seul script, sans `import`.                                                         |
| `source.js`                | Facultatif : le code source quand il utilise des dépendances npm (cheerio…), empaqueté en `bundle.js` par esbuild. |
| `status.json`              | Généré par le workflow de santé (voir §7).                                                                         |
| `THIRD_PARTY_LICENSES.txt` | Généré pour les sources empaquetées : licences des dépendances.                                                    |

## 2. Le manifeste

```json
{
  "schemaVersion": 1,
  "id": "org.mangadex.en",
  "name": "MangaDex English",
  "version": "1.5.2",
  "language": "en",
  "contentRating": "adult",
  "allowedHosts": ["api.mangadex.org"],
  "bundle": "./bundle.js"
}
```

| Champ           | Règle                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion` | Toujours `1`.                                                                                                                                          |
| `id`            | Identifiant stable et unique, minuscules : `^[a-z0-9][a-z0-9.-]{2,63}$`. Le changer revient à créer une autre source (les mangas liés ne suivent pas). |
| `name`          | Nom affiché dans l'app.                                                                                                                                |
| `version`       | Texte libre, à changer à chaque publication : l'app installe toute version différente de la sienne.                                                    |
| `language`      | Code de langue : `en`, `fr`, `pt-BR`…                                                                                                                  |
| `contentRating` | `safe` ou `adult`. `adult` dès que la source peut afficher des œuvres réservées aux adultes : l'app demande une confirmation avant de l'installer.     |
| `allowedHosts`  | Les seuls domaines que `app.fetch` peut appeler, en HTTPS. Pas de `localhost` ni d'adresse IP. Les images des pages n'ont pas besoin d'y figurer.      |
| `bundle`        | Chemin du bundle, relatif au manifeste.                                                                                                                |
| `sha256`        | Ajouté par `node scripts/build-source-repo.mjs`. L'app refuse un bundle dont l'empreinte ne correspond pas.                                            |

Limites : manifeste de 64 Ko au plus, bundle de 2 Mo au plus.

## 3. Le bac à sable

Le bundle est exécuté dans une WebView cachée, sans accès au réseau ni au stockage de
l'app (la politique de sécurité du contenu bloque `fetch`, `XMLHttpRequest` et les images).
Il doit définir `globalThis.source`, un objet dont les méthodes sont décrites au §4.

Toutes les requêtes passent par `app.fetch` :

```js
const response = await app.fetch('https://api.example.com/search?q=one', {
  method: 'GET', // ou 'POST' (corps texte obligatoire, 100 000 caractères au plus)
  headers: { Accept: 'application/json' },
});
// response = { status: 200, body: '…texte de la réponse…' }
if (response.status < 200 || response.status >= 300) throw new Error('HTTP ' + response.status);
const data = JSON.parse(response.body);
```

- Seuls les domaines de `allowedHosts`, en `https://`.
- En-têtes transmis : `Accept`, `Referer`, `Authorization`, `X-API-Key`, `Content-Type`. Les
  autres sont ignorés.
- Une requête au plus toutes les 350 ms par source ; délai maximal de 15 s ; réponse de
  2 Mo au plus.
- `app.fetch` ne lève pas d'erreur sur un statut HTTP d'échec : à la source de le vérifier.

Délais côté app : 12 s pour charger le bundle, 20 s pour qu'une méthode réponde. Les appels
d'une même source passent l'un après l'autre ; le lecteur est prioritaire.

Une méthode qui échoue doit lever une `Error` avec un message court et compréhensible : il
peut être affiché tel quel.

## 4. Les méthodes

Les cinq premières sont obligatoires. Les trois suivantes sont facultatives : l'app détecte
leur absence (« Méthode absente ») et s'en passe.

Tout ce qu'une source renvoie est vérifié par l'app ([`sources/parse.ts`](../sources/parse.ts)
et [`sources/api.ts`](../sources/api.ts)) : un élément invalide est ignoré, une valeur
invalide fait échouer l'appel.

### Le type `Manga`

Utilisé par `search`, `manga`, `discover` et `catalog`.

```js
{
  id: 'a1b2c3',                 // obligatoire : identifiant du manga dans la source
  title: 'Solo Leveling',       // obligatoire
  altTitles: ['Na Honjaman Level Up'],
  coverUrl: 'https://…/cover.jpg',
  description: 'Résumé…',
  anilistId: 105398,            // fortement conseillé : relie le manga entre sources et à AniList
  genres: ['Action', 'Fantasy'],         // 20 au plus, 40 caractères chacun
  authors: ['Chugong', 'DUBU'],          // idem
  contentRating: 'safe',        // 'safe' | 'suggestive' | 'erotica' | 'pornographic'
}
```

- `id` est passé tel quel à `manga()` et `chapters()` : un chemin d'URL fait l'affaire.
- Préférer le titre anglais comme `title` quand le titre principal est romanisé.
- `contentRating` par titre : `erotica` et `pornographic` sont masqués tant que le contenu
  sensible l'est. Sans ce champ, l'app se rabat sur les genres : Adult, Hentai, Smut,
  Erotica, Érotique, Pornographic, Pornographique. **Renvoyer les genres ou la
  classification dès les listes** (recherche, Découvrir, catalogue), pas seulement dans
  `manga()` : sinon un titre adulte reste visible dans les listes jusqu'à son ouverture.
- Les sources HTML empaquetées utilisent `scripts/source-classification.js` pour appliquer
  les mêmes libellés explicites. Ne pas déduire `safe` de l'absence d'un genre : cela veut
  dire que la classification est inconnue. Certaines cartes de sites ne fournissent aucun
  genre ; la fiche est alors vérifiée séparément et les suggestions non classifiables
  peuvent être omises.

### `search(query)` — obligatoire

Renvoie un tableau de `Manga` (50 au plus). Une recherche sans résultat renvoie `[]`.

L'app relance d'elle-même la recherche avec d'autres écritures (avec ou sans « the »,
sans ponctuation) quand elle trouve moins de 3 résultats : inutile de le faire dans la
source.

### `manga(id)` — obligatoire

Renvoie le `Manga` complet : c'est lui qui alimente la fiche (synopsis, genres, auteurs) quand
le manga n'est pas trouvé sur AniList, et la classification du contenu.

### `chapters(id)` — obligatoire

Renvoie tous les chapitres lisibles :

```js
[
  {
    id: 'chapitre-201', // obligatoire : passé à pages()
    number: 201, // obligatoire : nombre fini, les demi-chapitres (10.5) sont acceptés
    title: 'Épilogue',
    language: 'en',
    publishedAt: '2024-01-14T00:00:00Z', // affiché « il y a 2 jours » dans la liste
  },
];
```

- Le numéro sert de clé : un même numéro venant de plusieurs sources est un seul chapitre
  dans l'app.
- Exclure les chapitres sans images (liens externes, chapitres verrouillés) plutôt que de
  les renvoyer : ils apparaîtraient comme lisibles.

### `pages(chapterId)` — obligatoire

Renvoie les images dans l'ordre de lecture, en HTTPS :

```js
['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg']
// ou, quand l'hébergeur exige des en-têtes :
[{ url: 'https://cdn.example.com/1.jpg', headers: { Referer: 'https://example.com/' } }]
```

En-têtes acceptés pour les images : `Referer`, `Accept`, `Authorization`, `X-API-Key`. Les
images sont chargées par l'app (et téléchargées pour la lecture hors ligne), pas par le bac
à sable. Une liste vide est une erreur (« Aucune page disponible »).

### `health()` — obligatoire

Renvoie `true` quand le site répond normalement. Faire une requête légère (une page de
liste, `limit=1`). Ne pas lever d'erreur : renvoyer `false`.

### `discover()` — facultatif

Le contenu de l'onglet Découvrir pour cette source :

```js
{
  sections: [
    // 6 sections au plus, 30 mangas chacune ; titre de 40 caractères au plus
    { title: 'Populaires', items: [/* Manga */], more: 'popular' },
    { title: 'Mises à jour', items: [/* Manga */], more: 'updated' },
  ],
  genres: [
    // 500 au plus ; titre de 30 caractères au plus
    { id: 'genre:action', title: 'Action' },
    { id: 'genre:adult', title: 'Adult', sensitive: true },
  ],
}
```

- `more` (facultatif) est un identifiant de liste passé à `catalog(page, more)` : il ajoute
  « Tout voir » à la section.
- L'`id` d'un genre est aussi un identifiant de liste pour `catalog()`.
- `sensitive: true` masque la catégorie tant que le contenu sensible l'est. Les noms
  listés plus haut (Adult, Hentai, Smut…) sont marqués d'office ; le préciser pour tout
  autre libellé qui désigne explicitement du contenu adulte. « Ecchi » et « Mature » ne
  sont pas sensibles à eux seuls (voir la décision dans `PROJECT.md`, §9).
- Les sections vides sont ignorées.

### `recommendations()` — facultatif, ancien

Une seule section `{ title, items }`. Utilisée seulement quand `discover()` est absente :
préférer `discover()`.

### `catalog(page, listing)` — facultatif

Une page du catalogue complet, ou d'une liste (`more` d'une section, `id` d'un genre) :

```js
// page : 1, 2, 3… ; listing : un identifiant de liste, ou null pour le tri par défaut
{
  items: [/* Manga, 100 au plus */],
  hasMore: true,          // false sur la dernière page
  sorts: [                // 8 au plus : les tris proposés en haut du catalogue
    { id: 'popular', title: 'Populaires' },
    { id: 'new', title: 'Nouveautés' },
  ],
}
```

Les `id` de `sorts` sont eux aussi passés en `listing`. Un identifiant inconnu doit lever
une erreur. Renvoyer `items: []` et `hasMore: false` au-delà de la dernière page.

## 5. Contenu sensible et contenu interdit

- Déclarer `contentRating: "adult"` dans le manifeste dès qu'une catégorie ou un titre est
  réservé aux adultes. Passer d'une source `safe` à `adult` demande une confirmation : la
  mise à jour automatique attend l'utilisateur.
- Classer chaque titre (`contentRating` ou genres) et marquer les catégories sensibles,
  pour que le masquage du contenu sensible fonctionne partout.
- **Exclure toujours** les contenus sexualisant des mineurs (tags « Loli », « Shota »,
  « Lolicon », « Shotacon » et équivalents) : de la recherche, des listes, des catégories et
  de `manga()`. MangaDex et MangaKatana montrent comment faire.
- Ne pas viser de contenu sans droit de diffusion. Kumo Reader est livré vide ; chaque
  source est responsable de ce qu'elle rend accessible.

## 6. Construire et publier

1. Modifier `bundle.js` (ou `source.js` pour une source empaquetée).
2. Changer `version` dans `manifest.base.json`.
3. `node scripts/build-source-repo.mjs` : empaquette les sources HTML, calcule les
   empreintes, écrit les `manifest.json` et régénère la page d'installation.
4. `npm run sources:verify` : vérifie les empreintes.
5. Committer `source-repo/` et pousser : le workflow publie le dossier sur GitHub Pages.

Une nouvelle source doit aussi être ajoutée à la liste de `scripts/build-source-repo.mjs`
(et à celle des sources empaquetées si elle a un `source.js`), à
`scripts/check-source-repo.mjs` pour le suivi de santé, et à `source-repo/README.md`.

L'app installe d'elle-même les nouvelles versions, au plus toutes les 6 heures, ou tout de
suite avec **Réglages → Sources → Tout mettre à jour**.

## 7. Santé

- `health()` est appelée par **Réglages → Sources → Vérifier les sources** et après chaque
  installation ou mise à jour.
- `status.json`, à côté du manifeste, est facultatif : `{ "sourceId", "checkedAt",
  "status": "ok" }`. Le workflow `.github/workflows/source-health.yml` le met à jour toutes
  les 6 heures à partir de `scripts/check-source-repo.mjs`. Une source dont le dernier
  contrôle date de plus de 24 h, ou n'est pas `ok`, est affichée « À surveiller ».

## 8. Tester

Les scripts `scripts/smoke-*.mjs` exécutent un bundle dans Node, avec un `app.fetch`
branché sur le `fetch` de Node (voir `scripts/smoke-mangadex.mjs`) : recherche, chapitres,
puis une vraie page. Pour une
nouvelle source, en copier un et l'adapter :

```bash
node scripts/smoke-mangadex.mjs
```

Puis l'installer dans l'app depuis **Sources → Installer une source** avec l'URL de son
dossier publié.

## Récapitulatif

| Méthode                  | Obligatoire  | Renvoie                                             |
| ------------------------ | ------------ | --------------------------------------------------- |
| `search(query)`          | oui          | `Manga[]` (50 max)                                  |
| `manga(id)`              | oui          | `Manga`                                             |
| `chapters(id)`           | oui          | `{ id, number, title?, language?, publishedAt? }[]` |
| `pages(chapterId)`       | oui          | `string[]` ou `{ url, headers? }[]`, en HTTPS       |
| `health()`               | oui          | `true` / `false`                                    |
| `discover()`             | non          | `{ sections, genres }`                              |
| `catalog(page, listing)` | non          | `{ items, hasMore, sorts }`                         |
| `recommendations()`      | non (ancien) | `{ title, items }`                                  |

Les huit sources installables suivent ce contrat. MangaDex fournit sa classification par
titre directement depuis l'API. MangaKatana, Flame Comics et Komga transmettent les genres
de leurs listes ; MangaBats et MangaKakalot les extraient des résumés quand ils sont
présents. Asura Scans ne publie les genres que sur les fiches, et Pepper&Carrot déclare
son unique série `safe`. Les dates de chapitre proviennent du site ; celles d'Asura Scans
sont approximées à partir de ses libellés relatifs (« 3 hours ago »).
