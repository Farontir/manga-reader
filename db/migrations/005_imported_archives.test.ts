import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';

import { importedArchivesMigration } from './005_imported_archives';

describe('imported archives migration', () => {
  it('is idempotent and keeps records independent from library entries', async () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      const db = {
        execAsync: async (sql: string) => {
          sqlite.exec(sql);
        },
      } as SQLiteDatabase;

      await importedArchivesMigration(db);
      await importedArchivesMigration(db);
      sqlite.exec(`INSERT INTO imported_archives(archive_key, status, recorded_at)
        VALUES ('One Piece/T01.cbz|1024', 'imported', '2026-09-27')`);

      expect(sqlite.prepare('PRAGMA foreign_key_list(imported_archives)').all()).toEqual([]);
      expect(sqlite.prepare('SELECT status FROM imported_archives').all()).toEqual([
        { status: 'imported' },
      ]);
    } finally {
      sqlite.close();
    }
  });
});
