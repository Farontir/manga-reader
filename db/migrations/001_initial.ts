import type { SQLiteDatabase } from 'expo-sqlite';

export async function initialMigration(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE library_entries (
      id TEXT PRIMARY KEY,
      canonical_title TEXT NOT NULL,
      alt_titles_json TEXT NOT NULL DEFAULT '[]',
      cover_url TEXT,
      anilist_id INTEGER,
      description TEXT,
      status TEXT,
      added_at TEXT NOT NULL,
      last_read_at TEXT
    );
    CREATE INDEX idx_library_anilist ON library_entries(anilist_id);
    CREATE INDEX idx_library_last_read ON library_entries(last_read_at);

    CREATE TABLE source_bindings (
      id TEXT PRIMARY KEY,
      library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      manga_id TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      last_seen_ok TEXT,
      last_error TEXT,
      UNIQUE(library_entry_id, source_id)
    );
    CREATE INDEX idx_bindings_entry ON source_bindings(library_entry_id);
    CREATE INDEX idx_bindings_source ON source_bindings(source_id);

    CREATE TABLE read_progress (
      library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
      chapter_number REAL NOT NULL,
      page_index INTEGER NOT NULL DEFAULT 0,
      total_pages INTEGER,
      read_at TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(library_entry_id, chapter_number)
    );
    CREATE INDEX idx_progress_read_at ON read_progress(read_at);

    CREATE TABLE known_chapters (
      library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_number REAL NOT NULL,
      title TEXT,
      language TEXT,
      published_at TEXT,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY(library_entry_id, source_id, chapter_id)
    );
    CREATE INDEX idx_chapters_entry_number ON known_chapters(library_entry_id, chapter_number);

    CREATE TABLE installed_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      language TEXT NOT NULL,
      content_rating TEXT NOT NULL,
      repo_url TEXT NOT NULL,
      bundle_uri TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      installed_at TEXT NOT NULL,
      last_health_check TEXT,
      health_status TEXT
    );

    CREATE TABLE local_chapters (
      library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
      chapter_number REAL NOT NULL,
      title TEXT NOT NULL,
      archive_uri TEXT,
      page_uris_json TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      PRIMARY KEY(library_entry_id, chapter_number)
    );

    CREATE TABLE downloaded_chapters (
      library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
      chapter_number REAL NOT NULL,
      source_id TEXT NOT NULL,
      page_uris_json TEXT NOT NULL,
      downloaded_at TEXT NOT NULL,
      size_bytes INTEGER,
      PRIMARY KEY(library_entry_id, chapter_number)
    );

    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
}
