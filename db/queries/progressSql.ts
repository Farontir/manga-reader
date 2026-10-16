// Kept apart from chapters.ts so tests can run them against node:sqlite.

/** Marks one chapter read without opening it; a chapter already started is just completed. */
export const MARK_READ_SQL = `INSERT INTO read_progress(library_entry_id, chapter_number,
    page_index, total_pages, read_at, completed, manual) VALUES (?, ?, 0, NULL, ?, 1, 1)
  ON CONFLICT(library_entry_id, chapter_number) DO UPDATE SET completed = 1`;

/** Unread again: no progress at all, as if never opened. */
export const MARK_UNREAD_SQL =
  'DELETE FROM read_progress WHERE library_entry_id = ? AND chapter_number = ?';
