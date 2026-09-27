import type { SQLiteDatabase } from 'expo-sqlite';

// Archives already handled by the watched-folder import, so a rescan only opens new files.
// No foreign key on purpose: a manga removed from the library must not come back on the next scan.
export async function importedArchivesMigration(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS imported_archives (
      archive_key TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      error TEXT,
      recorded_at TEXT NOT NULL
    );
  `);
}
