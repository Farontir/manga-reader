import * as SQLite from 'expo-sqlite';

import { initialMigration } from './migrations/001_initial';

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('manga-reader.db');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
  );`);
  const version = await db.getFirstAsync<{ version: number }>(
    'SELECT MAX(version) AS version FROM schema_migrations',
  );
  if (!version?.version) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await initialMigration(tx);
      await tx.runAsync(
        'INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)',
        1,
        '001_initial',
        new Date().toISOString(),
      );
    });
  }
  return db;
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!opening)
    opening = open().catch((error: unknown) => {
      opening = null;
      throw error;
    });
  return opening;
}
