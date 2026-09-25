import * as Crypto from 'expo-crypto';

import type { BackupSnapshot } from '../backupFormat';
import { getDatabase } from '../connection';
import { listKnownChapters, listProgress } from './chapters';
import { findEntryByAniListId, getLibraryEntry, listBindings, listLibraryEntries } from './library';
import { listInstalledSources } from './sources';

export async function exportBackup(): Promise<BackupSnapshot> {
  const entries = await listLibraryEntries();
  const [bindings, progress, chapters, sources] = await Promise.all([
    Promise.all(entries.map((entry) => listBindings(entry.id))),
    Promise.all(entries.map((entry) => listProgress(entry.id))),
    Promise.all(entries.map((entry) => listKnownChapters(entry.id))),
    listInstalledSources(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
    bindings: bindings.flat(),
    progress: progress.flat(),
    chapters: chapters.flat(),
    sourceRepos: sources.map((source) => source.repoUrl),
  };
}

export async function importBackup(snapshot: BackupSnapshot): Promise<number> {
  const mappedIds = new Map<string, string>();
  for (const entry of snapshot.entries) {
    const existing = entry.anilistId
      ? await findEntryByAniListId(entry.anilistId)
      : await getLibraryEntry(entry.id);
    mappedIds.set(entry.id, existing?.id ?? entry.id);
  }
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const entry of snapshot.entries) {
      const id = mappedIds.get(entry.id);
      if (!id) continue;
      await tx.runAsync(
        `INSERT INTO library_entries(id, canonical_title, alt_titles_json, cover_url, anilist_id,
          description, status, added_at, last_read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET last_read_at = CASE
           WHEN excluded.last_read_at > library_entries.last_read_at THEN excluded.last_read_at
           ELSE library_entries.last_read_at END`,
        id,
        entry.canonicalTitle,
        JSON.stringify(entry.altTitles),
        entry.coverUrl,
        entry.anilistId,
        entry.description,
        entry.status,
        entry.addedAt,
        entry.lastReadAt,
      );
    }
    for (const binding of snapshot.bindings) {
      const entryId = mappedIds.get(binding.libraryEntryId);
      if (!entryId) continue;
      await tx.runAsync(
        `INSERT INTO source_bindings(id, library_entry_id, source_id, manga_id, priority,
          last_seen_ok, last_error) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(library_entry_id, source_id) DO UPDATE SET
           manga_id = excluded.manga_id, priority = excluded.priority`,
        Crypto.randomUUID(),
        entryId,
        binding.sourceId,
        binding.mangaId,
        binding.priority,
        binding.lastSeenOk,
        binding.lastError,
      );
    }
    for (const progress of snapshot.progress) {
      const entryId = mappedIds.get(progress.libraryEntryId);
      if (!entryId) continue;
      await tx.runAsync(
        `INSERT INTO read_progress(library_entry_id, chapter_number, page_index,
          total_pages, read_at, completed) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(library_entry_id, chapter_number) DO UPDATE SET
           page_index = excluded.page_index, total_pages = excluded.total_pages,
           read_at = excluded.read_at, completed = excluded.completed
         WHERE excluded.read_at > read_progress.read_at`,
        entryId,
        progress.chapterNumber,
        progress.pageIndex,
        progress.totalPages,
        progress.readAt,
        progress.completed ? 1 : 0,
      );
    }
    for (const chapter of snapshot.chapters) {
      const entryId = mappedIds.get(chapter.libraryEntryId);
      if (!entryId) continue;
      await tx.runAsync(
        `INSERT INTO known_chapters(library_entry_id, source_id, chapter_id,
          chapter_number, title, language, published_at, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(library_entry_id, source_id, chapter_id) DO NOTHING`,
        entryId,
        chapter.sourceId,
        chapter.chapterId,
        chapter.number,
        chapter.title,
        chapter.language,
        chapter.publishedAt,
        chapter.fetchedAt,
      );
    }
  });
  return snapshot.entries.length;
}
