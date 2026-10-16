import { visibleSql } from './sensitiveSql';

// Last chapters opened, newest first. Progress flagged `manual` (marked read from the list,
// or removed from the history) is left out; sensitive manga only when included. Kept apart
// from history.ts so tests can run it against node:sqlite.
export const historySql = (includeSensitive: boolean): string => `SELECT
    progress.library_entry_id AS entryId, progress.chapter_number AS chapterNumber,
    progress.page_index AS pageIndex, progress.total_pages AS totalPages,
    progress.read_at AS readAt, progress.completed AS completed,
    entries.canonical_title AS title, entries.cover_url AS coverUrl
  FROM read_progress AS progress
  JOIN library_entries AS entries ON entries.id = progress.library_entry_id
  WHERE progress.manual = 0 ${includeSensitive ? '' : `AND ${visibleSql('entries')}`}
  ORDER BY progress.read_at DESC
  LIMIT ?`;

/** Leaves one chapter out of the history; its progress stays. */
export const HIDE_FROM_HISTORY_SQL = `UPDATE read_progress SET manual = 1
  WHERE library_entry_id = ? AND chapter_number = ?`;
