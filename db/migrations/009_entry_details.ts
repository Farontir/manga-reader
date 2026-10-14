import type { SQLiteDatabase } from 'expo-sqlite';

// Genres, authors, format, year, score… shown on the manga page, stored as one JSON blob
// so they stay available offline.
export async function entryDetailsMigration(db: SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(library_entries)');
  if (!columns.some((column) => column.name === 'details_json')) {
    await db.execAsync('ALTER TABLE library_entries ADD COLUMN details_json TEXT');
  }
}
