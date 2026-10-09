import type { SQLiteDatabase } from 'expo-sqlite';

// Opening a manga from Discover or Search creates its entry (needed for chapters and
// progress) without putting it on the library shelf: `in_library` is the bookmark.
// Existing entries were all added on purpose, so they default to the shelf.
export async function libraryBookmarkMigration(db: SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(library_entries)');
  if (!columns.some((column) => column.name === 'in_library')) {
    await db.execAsync(
      'ALTER TABLE library_entries ADD COLUMN in_library INTEGER NOT NULL DEFAULT 1',
    );
  }
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_library_in_library ON library_entries(in_library)',
  );
}
