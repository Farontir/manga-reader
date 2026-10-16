import { visibleSql } from './sensitiveSql';

// Profile statistics. Only chapters really read count (progress not flagged `manual`).
// Kept apart from stats.ts so tests can run them against node:sqlite.

export const ADD_READING_TIME_SQL = `INSERT INTO reading_sessions(library_entry_id,
  chapter_number, started_at, seconds) VALUES (?, ?, ?, ?)`;

/** Total reading time, and since the given ISO date. */
export const READING_TIME_SQL = `SELECT COALESCE(SUM(seconds), 0) AS total,
  COALESCE(SUM(CASE WHEN started_at >= ? THEN seconds ELSE 0 END), 0) AS recent
  FROM reading_sessions`;

export const CHAPTERS_READ_SQL = `SELECT COUNT(*) AS count FROM read_progress
  WHERE completed = 1 AND manual = 0`;

/** Local days (YYYY-MM-DD) with some reading. */
export const READING_DAYS_SQL = `SELECT date(read_at, 'localtime') AS day FROM read_progress
  WHERE manual = 0
  UNION SELECT date(started_at, 'localtime') AS day FROM reading_sessions`;

/**
 * Finished manga (status FINISHED on AniList or the source) whose every known chapter,
 * local or from a source, has been read.
 */
export const MANGA_COMPLETED_SQL = `SELECT COUNT(*) AS count FROM library_entries AS entries
  WHERE COALESCE(json_extract(entries.details_json, '$.status'), entries.status) = 'FINISHED'
    AND EXISTS (SELECT 1 FROM read_progress AS progress
      WHERE progress.library_entry_id = entries.id AND progress.completed = 1
        AND progress.manual = 0)
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT chapter_number FROM local_chapters WHERE library_entry_id = entries.id
        UNION SELECT chapter_number FROM known_chapters WHERE library_entry_id = entries.id
      ) AS chapters
      WHERE NOT EXISTS (SELECT 1 FROM read_progress AS progress
        WHERE progress.library_entry_id = entries.id
          AND progress.chapter_number = chapters.chapter_number AND progress.completed = 1)
    )`;

/** Chapters read per manga with its details (for genres); sensitive manga only if included. */
export const chaptersPerMangaSql = (includeSensitive: boolean): string => `SELECT
    entries.details_json AS detailsJson, COUNT(*) AS chapters
  FROM read_progress AS progress
  JOIN library_entries AS entries ON entries.id = progress.library_entry_id
  WHERE progress.completed = 1 AND progress.manual = 0
    ${includeSensitive ? '' : `AND ${visibleSql('entries')}`}
  GROUP BY entries.id`;
