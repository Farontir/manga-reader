# Manga Reader iOS — Vision projet

## 1. Pitch

Lecteur de manga iOS avec système de sources tierces, conçu pour résoudre les deux plus grosses frustrations des apps existantes (Paperback, Tachimanga) :

1. **Sources qui cassent en permanence** → monitoring + remplacement automatique
2. **Historique de lecture perdu** quand une source meurt → progression dissociée des sources

Positionnement : "Source meurt ? Ta bibliothèque survit."

## 2. Stack technique

- **Framework** : React Native + Expo (démarrage initial : SDK 54 ; projet migré vers SDK 57 pour l'Expo Go iPhone actuel)
- **Langage** : TypeScript strict
- **Build** : EAS Build (depuis Linux/Windows, aucun Mac requis)
- **Test device** : Expo Go pour le quotidien, EAS Development Build dès qu'on touche aux modules natifs
- **Stockage** : SQLite via `expo-sqlite` (PAS MMKV pour la bibliothèque, MMKV uniquement pour préférences UI)
- **Navigation** : Expo Router (file-based)
- **Styling** : NativeWind (Tailwind pour RN)
- **Listes performantes** : FlashList (Shopify)
- **Gestures** : react-native-gesture-handler + react-native-reanimated
- **Sandbox JS** : react-native-webview avec bridge custom (approche pragmatique)
- **HTTP** : fetch natif côté app, exposé aux sources via le bridge
- **Parsing HTML** : cheerio bundlé dans les sources qui en ont besoin
- **Service ID pivot** : AniList API (gratuite, IDs stables, large couverture)

## 3. Architecture clé

### 3.1 Séparation Library / Source

Règle architecturale fondamentale :

```
LibraryEntry (stable, jamais lié à une source)
    ↓ N bindings
SourceBinding (mangaId dans la source X)
```

- L'utilisateur ajoute "One Piece" en bibliothèque → on crée un `LibraryEntry` avec un UUID local
- On résout son `anilistId` (pivot stable)
- On lie automatiquement toutes les sources disponibles qui ont ce manga
- La progression est stockée **par numéro de chapitre**, pas par ID de chapitre source
- Si une source meurt : on bascule sur une autre, progression intacte

### 3.2 Système de sources

- Chaque source = bundle JS exposant une interface standard (`Source`)
- Sources chargées dans une WebView sandbox (isolation, pas d'accès au stockage app)
- Communication app ↔ sandbox via `postMessage`
- `app.fetch` exposé aux sources, exécuté côté natif (bypass CORS, gestion User-Agent, throttling)
- Sources distribuées via repos statiques (URL → manifest.json → bundles)

### 3.3 Schéma SQLite (v1)

```sql
-- Identité stable d'un manga en bibliothèque
CREATE TABLE library_entries (
  id TEXT PRIMARY KEY,              -- UUID
  canonical_title TEXT NOT NULL,
  alt_titles_json TEXT NOT NULL,    -- JSON array
  cover_url TEXT,
  cover_local_path TEXT,
  anilist_id INTEGER,
  mal_id INTEGER,
  added_at TEXT NOT NULL,
  last_read_at TEXT,
  status TEXT,                      -- ongoing/completed/...
  description TEXT
);

-- Liens vers les représentations dans chaque source
CREATE TABLE source_bindings (
  id TEXT PRIMARY KEY,
  library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  manga_id_in_source TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  last_seen_ok TEXT,
  last_error TEXT,
  UNIQUE(library_entry_id, source_id)
);

-- Progression : par numéro de chapitre (stable cross-source)
CREATE TABLE read_progress (
  library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  chapter_number REAL NOT NULL,     -- 1087.5 supporté
  page_index INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER,
  read_at TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(library_entry_id, chapter_number)
);

-- Cache des chapitres connus (pour affichage offline et détection nouveautés)
CREATE TABLE known_chapters (
  library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  chapter_id_in_source TEXT NOT NULL,
  chapter_number REAL NOT NULL,
  volume REAL,
  name TEXT,
  lang_code TEXT,
  group_name TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(library_entry_id, source_id, chapter_id_in_source)
);

-- Sources installées
CREATE TABLE installed_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  language TEXT NOT NULL,
  content_rating TEXT NOT NULL,
  repo_url TEXT,
  bundle_path TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  last_health_check TEXT,
  health_status TEXT                -- ok/degraded/down
);

-- Téléchargements offline
CREATE TABLE downloaded_chapters (
  library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
  chapter_number REAL NOT NULL,
  source_id TEXT NOT NULL,
  local_dir TEXT NOT NULL,
  page_count INTEGER NOT NULL,
  downloaded_at TEXT NOT NULL,
  size_bytes INTEGER,
  PRIMARY KEY(library_entry_id, chapter_number)
);

-- Versionnement du schéma — géré par le runner de migrations
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

Index utiles ajoutés en migration 001 : `library_entries(anilist_id)`,
`library_entries(last_read_at)`, `source_bindings(library_entry_id)`,
`source_bindings(source_id)`, `read_progress(read_at)`,
`known_chapters(library_entry_id, chapter_number)`.

### 3.4 Pattern de connexion DB

Une seule connexion partagée (`getDatabase()` dans `db/index.ts`).
Le module cache la **Promise** d'ouverture (pas l'instance) pour
éviter les races sur appels concurrents au boot. Les migrations sont
exécutées en transaction au premier appel ; chaque migration insère
sa ligne dans `schema_migrations` dans la même transaction. Aucun
fichier hors `db/` n'importe `expo-sqlite` ni n'écrit du SQL.

## 4. Roadmap par phases

### Phase 1 — Fondations (1-2 semaines)

- Setup Expo + TypeScript strict + ESLint + Prettier
- Compte Apple Developer + EAS configuré
- Premier build dev sur iPhone via Expo Go
- Navigation : Library / Search / Settings
- Schéma SQLite v1 + migrations
- Theming clair/sombre, NativeWind
- **Livrable** : app vide qui démarre sur iPhone, navigation OK, DB initialisée

### Phase 2 — Reader avec données mock (1 semaine)

- Écran reader (paginé + webtoon)
- Gestion mémoire images (préchargement N+1, libération N-2)
- Gestures : pinch-zoom, double-tap, swipe
- Pages depuis dossier local (mode "fichiers locaux" uniquement, pour valider perfs)
- **Livrable** : on peut lire un manga en CBZ/dossier d'images, fluide

### Phase 3 — Première source hardcodée : MangaDex (1 semaine)

- Implémentation `Source` interface en TS, intégrée dans l'app
- Recherche, détails, chapitres, pages
- Cache d'images (expo-file-system) + LRU
- Flux complet : search → library → read
- AniList lookup au moment de l'ajout en bibliothèque
- **Livrable** : on cherche un manga, on l'ajoute, on lit, ça marche

### Phase 4 — Sandbox JS et source dynamique (2-3 semaines)

- WebView cachée + bridge postMessage
- Bridge `app.fetch` côté natif
- Format de bundle de source + builder esbuild
- Extraction de MangaDex en source externe chargée dynamiquement
- Repo de sources : manifest.json + bundles, héberge sur GitHub Pages
- Installation depuis URL
- **Livrable** : on peut installer/désinstaller MangaDex via une URL de repo

### Phase 5 — 2 sources supplémentaires (1-2 semaines)

- 1 source API propre (MangaPlus ou Komga client)
- 1 source scraping HTML avec cheerio
- Itérations sur l'interface Source en fonction des frictions rencontrées
- **Livrable** : 3 sources installables, toutes fonctionnelles

### Phase 6 — Robustesse (LE différenciateur, 2-3 semaines)

- Matching cross-source automatique à l'ajout (via AniList ID)
- Flux "remplacer la source" en un tap quand une source meurt
- Monitoring santé : GitHub Action sur le repo de sources + endpoint d'état
- Affichage état des sources dans l'app (vert/orange/rouge)
- Désinstallation d'une source ne supprime JAMAIS l'historique
- **Livrable** : on peut désinstaller toutes les sources, l'historique survit

### Phase 7 — Backup & polish (1-2 semaines)

- Backup iCloud (export/import JSON)
- Téléchargement offline en background
- États vides, loading, erreurs propres
- Animations, haptics
- **Livrable** : app prête pour soumission

### Phase 8 — Publication (1 semaine + review)

- Screenshots, description, privacy policy
- Positionnement App Store : "Reader avec extensions" (pas "lecteur de scans")
- Soumission via EAS Submit
- Itérations sur les rejets éventuels

## 5. Principes de code

- **TypeScript strict** : `"strict": true`, pas de `any` sans justification commentée
- **Pas de classes inutiles** : préférer des fonctions et des modules
- **Couches clairement séparées** : `db/`, `services/`, `sources/`, `ui/`, `native-bridge/`
- **Pas d'état global magique** : Zustand pour l'état UI, SQLite source de vérité pour les données
- **Tests** : Vitest pour la logique pure (matching, parsing), pas de tests E2E pour l'instant
- **Migrations DB versionnées** : jamais de `DROP TABLE`, toujours additif

## 6. Règles avec Claude Code

- Avant chaque session, relire ce document
- Travailler par **petits commits atomiques** avec messages clairs
- Avant d'écrire du code complexe, écrire un plan en commentaires ou dans un fichier `NOTES.md` temporaire
- Pour les phases 4 et 6 (sandbox + matching), faire des spikes isolés avant d'intégrer
- Toujours valider sur device réel (iPhone), pas seulement le simulateur web

## 7. Hors scope v1

- Trackers (AniList, MAL, Kitsu) → v2
- Catégories/tags utilisateur → v2
- Sync entre appareils via serveur perso → v2
- Mode incognito → v2
- Sources NSFW → v2 avec gating

## 8. Risques identifiés

- **App Store review** : positionnement reader+extensions, app livrée vide, pas de source bundlée scrapeuse
- **Performance reader** : tester tôt sur des chapitres de 200+ pages, anticiper OOM
- **Cloudflare** : prévoir une solution pour les sites protégés (header tweaks d'abord, WebView fallback ensuite)
- **AniList rate limit** : 90 req/min, prévoir cache local des matches
