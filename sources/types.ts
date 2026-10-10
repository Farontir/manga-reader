export type SourceManga = {
  id: string;
  title: string;
  altTitles?: string[];
  coverUrl?: string;
  description?: string;
  anilistId?: number;
};

export type SourceChapter = {
  id: string;
  number: number;
  title?: string;
  language?: string;
  publishedAt?: string;
};

export type SourcePage = { url: string; headers?: Record<string, string> };

export type SourceManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  language: string;
  contentRating: 'safe';
  allowedHosts: string[];
  bundle: string;
  sha256: string;
};

/** A titled row of manga in a source's Discover page (trending, latest updates…). */
export type SourceSection = { title: string; items: SourceManga[] };

/** A way to order a source's full catalogue, offered by the source itself. */
export type SourceSort = { id: string; title: string };

/** One page of a source's full catalogue. `sorts` lists the orders the source supports. */
export type SourceCatalogPage = { items: SourceManga[]; hasMore: boolean; sorts: SourceSort[] };

// `discover` (several sections), `recommendations` (one section) and `catalog` (paged full
// catalogue) are optional: bundles that predate them answer "Méthode absente".
export type SourceMethod =
  'search' | 'manga' | 'chapters' | 'pages' | 'health' | 'recommendations' | 'discover' | 'catalog';
