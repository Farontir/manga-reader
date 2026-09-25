import type { SQLiteDatabase } from 'expo-sqlite';

export async function downloadJobsMigration(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE download_jobs (
      library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
      chapter_number REAL NOT NULL,
      source_id TEXT NOT NULL,
      pages_json TEXT NOT NULL,
      next_page INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY(library_entry_id, chapter_number)
    );
    CREATE INDEX idx_download_jobs_created ON download_jobs(created_at);
  `);
}
