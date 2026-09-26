import * as SQLite from 'expo-sqlite';

import { initialMigration } from './migrations/001_initial';
import { downloadJobsMigration } from './migrations/002_download_jobs';
import { ensureSettingsMigration } from './migrations/003_ensure_settings';
import { repairSchemaMigration } from './migrations/004_repair_schema';

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
  const migrations = [
    { version: 1, name: '001_initial', run: initialMigration },
    { version: 2, name: '002_download_jobs', run: downloadJobsMigration },
    { version: 3, name: '003_ensure_settings', run: ensureSettingsMigration },
    { version: 4, name: '004_repair_schema', run: repairSchemaMigration },
  ];
  for (const migration of migrations) {
    if (migration.version <= (version?.version ?? 0)) continue;
    await db.withExclusiveTransactionAsync(async (tx) => {
      await migration.run(tx);
      await tx.runAsync(
        'INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)',
        migration.version,
        migration.name,
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
