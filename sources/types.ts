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

// `discover` (several sections) and `recommendations` (one section) are optional: bundles
// that predate them answer "Méthode absente".
export type SourceMethod =
  'search' | 'manga' | 'chapters' | 'pages' | 'health' | 'recommendations' | 'discover';
