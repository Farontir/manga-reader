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

/** Section shown in Explorer before any search: trending titles, or latest additions. */
export type SourceRecommendations = { title: string; items: SourceManga[] };

// `recommendations` is optional: bundles published before it answer "Méthode absente".
export type SourceMethod = 'search' | 'manga' | 'chapters' | 'pages' | 'health' | 'recommendations';
