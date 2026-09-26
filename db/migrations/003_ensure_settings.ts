import type { SQLiteDatabase } from 'expo-sqlite';

export async function ensureSettingsMigration(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
  );
}
