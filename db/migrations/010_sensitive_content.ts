import type { SQLiteDatabase } from 'expo-sqlite';

// Content classification of each manga: the rating given by its sources (MangaDex values:
// safe, suggestive, erotica, pornographic), AniList's adult flag, and the user's choice
// (NULL = automatic, 1 = sensitive, 0 = all audiences).
export async function sensitiveContentMigration(db: SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(library_entries)');
  const missing = [
    ['content_rating', 'TEXT'],
    ['anilist_adult', 'INTEGER'],
    ['user_sensitive_override', 'INTEGER'],
  ].filter(([name]) => !columns.some((column) => column.name === name));
  for (const [name, type] of missing) {
    await db.execAsync(`ALTER TABLE library_entries ADD COLUMN ${name} ${type}`);
  }
}
