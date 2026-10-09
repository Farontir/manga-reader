// Entries opened but never bookmarked, read, imported or downloaded, older than the cutoff.
// Kept apart from library.ts so tests can run it against node:sqlite.
export const PRUNE_BROWSED_ENTRIES_SQL = `DELETE FROM library_entries
  WHERE in_library = 0 AND added_at < ?
    AND id NOT IN (SELECT library_entry_id FROM read_progress)
    AND id NOT IN (SELECT library_entry_id FROM local_chapters)
    AND id NOT IN (SELECT library_entry_id FROM downloaded_chapters)
    AND id NOT IN (SELECT library_entry_id FROM download_jobs)`;
