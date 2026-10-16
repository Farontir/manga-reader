import type { SQLiteDatabase } from 'expo-sqlite';

// Time spent reading, per chapter visit. No foreign key: the profile keeps its totals even
// when a manga is removed from the library.
export async function readingSessionsMigration(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS reading_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      library_entry_id TEXT NOT NULL,
      chapter_number REAL NOT NULL,
      started_at TEXT NOT NULL,
      seconds INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reading_sessions_started ON reading_sessions(started_at);
  `);
}
