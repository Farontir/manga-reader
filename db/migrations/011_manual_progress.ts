import type { SQLiteDatabase } from 'expo-sqlite';

// Chapters marked read from the chapter list without being opened: they count as read but
// stay out of the reading history. Reading the chapter afterwards clears the flag.
export async function manualProgressMigration(db: SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(read_progress)');
  if (!columns.some((column) => column.name === 'manual')) {
    await db.execAsync('ALTER TABLE read_progress ADD COLUMN manual INTEGER NOT NULL DEFAULT 0');
  }
}
