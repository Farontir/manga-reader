// Unread chapters per bookmarked manga: every known chapter number (local files and the
// chapter lists of its preferred sources, or of all its sources when none is preferred;
// each number once) without completed progress. Kept apart from chapters.ts so tests can
// run it against node:sqlite.
export const UNREAD_COUNTS_SQL = `SELECT chapters.library_entry_id AS id, COUNT(*) AS unread
  FROM (
    SELECT library_entry_id, chapter_number FROM local_chapters
    UNION
    SELECT known.library_entry_id, known.chapter_number FROM known_chapters AS known
    WHERE NOT EXISTS (
        SELECT 1 FROM source_bindings AS binding
        WHERE binding.library_entry_id = known.library_entry_id AND binding.preferred = 1
      )
      OR EXISTS (
        SELECT 1 FROM source_bindings AS binding
        WHERE binding.library_entry_id = known.library_entry_id
          AND binding.source_id = known.source_id AND binding.preferred = 1
      )
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
