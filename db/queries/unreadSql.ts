// Unread chapters per bookmarked manga: every known chapter number (local files and
// source chapter lists, each number once) without completed progress. Kept apart from
// chapters.ts so tests can run it against node:sqlite.
export const UNREAD_COUNTS_SQL = `SELECT chapters.library_entry_id AS id, COUNT(*) AS unread
  FROM (
    SELECT library_entry_id, chapter_number FROM local_chapters
    UNION
    SELECT library_entry_id, chapter_number FROM known_chapters
  ) AS chapters
  JOIN library_entries AS entries
    ON entries.id = chapters.library_entry_id AND entries.in_library = 1
  WHERE NOT EXISTS (
    SELECT 1 FROM read_progress AS progress
    WHERE progress.library_entry_id = chapters.library_entry_id
      AND progress.chapter_number = chapters.chapter_number
      AND progress.completed = 1
  )
  GROUP BY chapters.library_entry_id`;
