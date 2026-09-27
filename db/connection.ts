import * as SQLite from 'expo-sqlite';

import { initialMigration } from './migrations/001_initial';
import { downloadJobsMigration } from './migrations/002_download_jobs';
import { ensureSettingsMigration } from './migrations/003_ensure_settings';
import { repairSchemaMigration } from './migrations/004_repair_schema';
import { importedArchivesMigration } from './migrations/005_imported_archives';
import { upgradeLegacyTablesMigration } from './migrations/006_upgrade_legacy_tables';

// Writers wait for a lock instead of failing at once with "database is locked".
const BUSY_TIMEOUT_MS = 5000;

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * expo-sqlite runs an exclusive transaction on a second connection, which holds the write
 * lock until it commits; that connection needs its own busy timeout.
 */
async function exclusive(
  db: SQLite.SQLiteDatabase,
  task: (tx: SQLite.SQLiteDatabase) => Promise<void>,
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`);
    await task(tx);
  });
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('manga-reader.db');
  // WAL lets reads proceed while a transaction writes.
  await db.execAsync(
    `PRAGMA journal_mode = WAL; PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}; PRAGMA foreign_keys = ON;`,
  );
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
    { version: 5, name: '005_imported_archives', run: importedArchivesMigration },
    { version: 6, name: '006_upgrade_legacy_tables', run: upgradeLegacyTablesMigration },
  ];
  for (const migration of migrations) {
    if (migration.version <= (version?.version ?? 0)) continue;
    await exclusive(db, async (tx) => {
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

/** Atomic multi-statement write, isolated from queries running on the shared connection. */
export async function withWriteTransaction(
  task: (tx: SQLite.SQLiteDatabase) => Promise<void>,
): Promise<void> {
  await exclusive(await getDatabase(), task);
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!opening)
    opening = open().catch((error: unknown) => {
      opening = null;
      throw error;
    });
  return opening;
}
