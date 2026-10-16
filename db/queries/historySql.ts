import { visibleSql } from './sensitiveSql';

// One line per manga: its chapter opened most recently, newest manga first, with the next
// known chapter (local or from a source) to continue with. Progress flagged `manual`
// (marked read from the list) is left out, and so is a manga removed from the history
// until it is read again; sensitive manga only when included. Kept apart from history.ts
// so tests can run it against node:sqlite.
export const historySql = (includeSensitive: boolean): string => `SELECT
    entryId, chapterNumber, pageIndex, totalPages, readAt, completed, title, coverUrl,
    nextChapter
  FROM (
    SELECT
      progress.library_entry_id AS entryId, progress.chapter_number AS chapterNumber,
      progress.page_index AS pageIndex, progress.total_pages AS totalPages,
      progress.read_at AS readAt, progress.completed AS completed,
      entries.canonical_title AS title, entries.cover_url AS coverUrl,
      (SELECT MIN(chapters.number) FROM (
          SELECT chapter_number AS number FROM local_chapters
            WHERE library_entry_id = progress.library_entry_id
          UNION SELECT chapter_number FROM known_chapters
            WHERE library_entry_id = progress.library_entry_id
        ) AS chapters
        WHERE chapters.number > progress.chapter_number) AS nextChapter,
      ROW_NUMBER() OVER (
        PARTITION BY progress.library_entry_id
        ORDER BY progress.read_at DESC, progress.chapter_number DESC
      ) AS position
    FROM read_progress AS progress
    JOIN library_entries AS entries ON entries.id = progress.library_entry_id
    WHERE progress.manual = 0
      AND (entries.history_hidden_at IS NULL OR progress.read_at > entries.history_hidden_at)
      ${includeSensitive ? '' : `AND ${visibleSql('entries')}`}
  )
  WHERE position = 1
  ORDER BY readAt DESC
  LIMIT ?`;

/** Removes a manga from the history until it is read again; its progress stays. */
export const HIDE_FROM_HISTORY_SQL =
  'UPDATE library_entries SET history_hidden_at = ? WHERE id = ?';
