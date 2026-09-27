import { getDatabase } from '../connection';
import type { Chapter, DownloadedChapter, LocalChapter, Progress } from '../schema';

type ChapterRow = {
  library_entry_id: string;
  source_id: string;
  chapter_id: string;
  chapter_number: number;
  title: string | null;
  language: string | null;
  published_at: string | null;
  fetched_at: string;
};
type ProgressRow = {
  library_entry_id: string;
  chapter_number: number;
  page_index: number;
  total_pages: number | null;
  read_at: string;
  completed: number;
};
type LocalRow = {
  library_entry_id: string;
  chapter_number: number;
  title: string;
  archive_uri: string | null;
  page_uris_json: string;
  imported_at: string;
};
type DownloadRow = {
  library_entry_id: string;
  chapter_number: number;
  source_id: string;
  page_uris_json: string;
  downloaded_at: string;
  size_bytes: number | null;
};

function parseUris(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function replaceKnownChapters(
  entryId: string,
  sourceId: string,
  chapters: Omit<Chapter, 'libraryEntryId' | 'sourceId' | 'fetchedAt'>[],
): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      'DELETE FROM known_chapters WHERE library_entry_id = ? AND source_id = ?',
      entryId,
      sourceId,
    );
    for (const chapter of chapters) {
      await tx.runAsync(
        `INSERT INTO known_chapters(library_entry_id, source_id, chapter_id, chapter_number,
          title, language, published_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        entryId,
        sourceId,
        chapter.chapterId,
        chapter.number,
        chapter.title,
        chapter.language,
        chapter.publishedAt,
        new Date().toISOString(),
      );
    }
  });
}

export async function listKnownChapters(entryId: string): Promise<Chapter[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ChapterRow>(
    `SELECT * FROM known_chapters WHERE library_entry_id = ?
     ORDER BY chapter_number DESC, published_at DESC`,
    entryId,
  );
  return rows.map((row) => ({
    libraryEntryId: row.library_entry_id,
    sourceId: row.source_id,
    chapterId: row.chapter_id,
    number: row.chapter_number,
    title: row.title,
    language: row.language,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
  }));
}

export async function saveProgress(
  entryId: string,
  chapterNumber: number,
  pageIndex: number,
  totalPages: number | null,
  completed: boolean,
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO read_progress(library_entry_id, chapter_number, page_index, total_pages,
        read_at, completed) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(library_entry_id, chapter_number) DO UPDATE SET
         page_index = excluded.page_index, total_pages = excluded.total_pages,
         read_at = excluded.read_at, completed = MAX(completed, excluded.completed)`,
      entryId,
      chapterNumber,
      pageIndex,
      totalPages,
      now,
      completed ? 1 : 0,
    );
    await tx.runAsync('UPDATE library_entries SET last_read_at = ? WHERE id = ?', now, entryId);
  });
}

export async function listProgress(entryId: string): Promise<Progress[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ProgressRow>(
    'SELECT * FROM read_progress WHERE library_entry_id = ? ORDER BY chapter_number DESC',
    entryId,
  );
  return rows.map((row) => ({
    libraryEntryId: row.library_entry_id,
    chapterNumber: row.chapter_number,
    pageIndex: row.page_index,
    totalPages: row.total_pages,
    readAt: row.read_at,
    completed: Boolean(row.completed),
  }));
}

export async function putLocalChapter(chapter: LocalChapter): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO local_chapters(library_entry_id, chapter_number, title, archive_uri,
      page_uris_json, imported_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(library_entry_id, chapter_number) DO UPDATE SET title = excluded.title,
       archive_uri = excluded.archive_uri, page_uris_json = excluded.page_uris_json,
       imported_at = excluded.imported_at`,
    chapter.libraryEntryId,
    chapter.chapterNumber,
    chapter.title,
    chapter.archiveUri,
    JSON.stringify(chapter.pageUris),
    chapter.importedAt,
  );
}

export async function listLocalChapters(entryId: string): Promise<LocalChapter[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<LocalRow>(
    'SELECT * FROM local_chapters WHERE library_entry_id = ? ORDER BY chapter_number DESC',
    entryId,
  );
  return rows.map((row) => ({
    libraryEntryId: row.library_entry_id,
    chapterNumber: row.chapter_number,
    title: row.title,
    archiveUri: row.archive_uri,
    pageUris: parseUris(row.page_uris_json),
    importedAt: row.imported_at,
  }));
}

export async function getLocalChapter(
  entryId: string,
  number: number,
): Promise<LocalChapter | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<LocalRow>(
    'SELECT * FROM local_chapters WHERE library_entry_id = ? AND chapter_number = ?',
    entryId,
    number,
  );
  return row
    ? {
        libraryEntryId: row.library_entry_id,
        chapterNumber: row.chapter_number,
        title: row.title,
        archiveUri: row.archive_uri,
        pageUris: parseUris(row.page_uris_json),
        importedAt: row.imported_at,
      }
    : null;
}

export async function putDownloadedChapter(chapter: DownloadedChapter): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO downloaded_chapters(library_entry_id, chapter_number, source_id,
       page_uris_json, downloaded_at, size_bytes) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(library_entry_id, chapter_number) DO UPDATE SET
       source_id = excluded.source_id, page_uris_json = excluded.page_uris_json,
       downloaded_at = excluded.downloaded_at, size_bytes = excluded.size_bytes`,
    chapter.libraryEntryId,
    chapter.chapterNumber,
    chapter.sourceId,
    JSON.stringify(chapter.pageUris),
    chapter.downloadedAt,
    chapter.sizeBytes,
  );
}

export async function getDownloadedChapter(
  entryId: string,
  number: number,
): Promise<DownloadedChapter | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DownloadRow>(
    'SELECT * FROM downloaded_chapters WHERE library_entry_id = ? AND chapter_number = ?',
    entryId,
    number,
  );
  return row
    ? {
        libraryEntryId: row.library_entry_id,
        chapterNumber: row.chapter_number,
        sourceId: row.source_id,
        pageUris: parseUris(row.page_uris_json),
        downloadedAt: row.downloaded_at,
        sizeBytes: row.size_bytes,
      }
    : null;
}

export async function deleteDownloadedChapter(entryId: string, number: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM downloaded_chapters WHERE library_entry_id = ? AND chapter_number = ?',
    entryId,
    number,
  );
}

export async function listDownloadedChapters(entryId: string): Promise<DownloadedChapter[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DownloadRow>(
    'SELECT * FROM downloaded_chapters WHERE library_entry_id = ?',
    entryId,
  );
  return rows.map((row) => ({
    libraryEntryId: row.library_entry_id,
    chapterNumber: row.chapter_number,
    sourceId: row.source_id,
    pageUris: parseUris(row.page_uris_json),
    downloadedAt: row.downloaded_at,
    sizeBytes: row.size_bytes,
  }));
}
