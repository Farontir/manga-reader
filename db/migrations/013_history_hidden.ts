import type { SQLiteDatabase } from 'expo-sqlite';

// A manga removed from the reading history: hidden until it is read again after this date.
// Its progress, and the XP it earned, stay untouched.
export async function historyHiddenMigration(db: SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(library_entries)');
  if (!columns.some((column) => column.name === 'history_hidden_at')) {
    await db.execAsync('ALTER TABLE library_entries ADD COLUMN history_hidden_at TEXT');
  }
}
