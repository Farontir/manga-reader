import type { SQLiteDatabase } from 'expo-sqlite';

// Several sources of one manga can be marked preferred: its chapter list then shows only
// their chapters (plus local files). None preferred means every source is shown.
export async function preferredSourcesMigration(db: SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(source_bindings)');
  if (!columns.some((column) => column.name === 'preferred')) {
    await db.execAsync(
      'ALTER TABLE source_bindings ADD COLUMN preferred INTEGER NOT NULL DEFAULT 0',
    );
  }
}
