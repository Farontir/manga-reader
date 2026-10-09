export type LibraryEntry = {
  id: string;
  canonicalTitle: string;
  altTitles: string[];
  coverUrl: string | null;
  anilistId: number | null;
  description: string | null;
  status: string | null;
  addedAt: string;
  lastReadAt: string | null;
  /** Bookmarked: shown in the library. Entries opened from Discover/Search start false. */
  inLibrary: boolean;
};

export type SourceBinding = {
  id: string;
  libraryEntryId: string;
  sourceId: string;
  mangaId: string;
  priority: number;
  lastSeenOk: string | null;
  lastError: string | null;
};

export type Chapter = {
  libraryEntryId: string;
  sourceId: string;
  chapterId: string;
  number: number;
  title: string | null;
  language: string | null;
  publishedAt: string | null;
  fetchedAt: string;
};

export type Progress = {
  libraryEntryId: string;
  chapterNumber: number;
  pageIndex: number;
  totalPages: number | null;
  readAt: string;
  completed: boolean;
};

export type InstalledSource = {
  id: string;
  name: string;
  version: string;
  language: string;
  contentRating: string;
  repoUrl: string;
  bundleUri: string;
  manifestJson: string;
  installedAt: string;
  lastHealthCheck: string | null;
  healthStatus: 'ok' | 'degraded' | 'down' | null;
};

export type LocalChapter = {
  libraryEntryId: string;
  chapterNumber: number;
  title: string;
  archiveUri: string | null;
  pageUris: string[];
  importedAt: string;
};

export type DownloadedChapter = {
  libraryEntryId: string;
  chapterNumber: number;
  sourceId: string;
  pageUris: string[];
  downloadedAt: string;
  sizeBytes: number | null;
};

export type DownloadJob = {
  libraryEntryId: string;
  chapterNumber: number;
  sourceId: string;
  pages: { uri: string; headers?: Record<string, string> }[];
  nextPage: number;
  createdAt: string;
};
