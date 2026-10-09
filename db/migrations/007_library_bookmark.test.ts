import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';

import { initialMigration } from './001_initial';
import { downloadJobsMigration } from './002_download_jobs';
import { libraryBookmarkMigration } from './007_library_bookmark';
import { PRUNE_BROWSED_ENTRIES_SQL } from '../queries/pruneSql';

function wrap(sqlite: DatabaseSync): SQLiteDatabase {
  return {
    execAsync: async (sql: string) => {
      sqlite.exec(sql);
    },
    getAllAsync: async (sql: string) => sqlite.prepare(sql).all(),
  } as unknown as SQLiteDatabase;
}

describe('library bookmark migration', () => {
  it('keeps existing entries on the shelf and is idempotent', async () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      const db = wrap(sqlite);
      await initialMigration(db);
      sqlite.exec(`INSERT INTO library_entries(id, canonical_title, added_at)
        VALUES ('old', 'Déjà là', '2026-01-01')`);
      await libraryBookmarkMigration(db);
      await libraryBookmarkMigration(db);
      expect(sqlite.prepare('SELECT in_library FROM library_entries').get()).toEqual({
        in_library: 1,
      });
    } finally {
      sqlite.close();
    }
  });

  it('prunes only old, unread, file-less entries off the shelf', async () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      const db = wrap(sqlite);
      await initialMigration(db);
      await downloadJobsMigration(db);
      await libraryBookmarkMigration(db);
      sqlite.exec(`
        INSERT INTO library_entries(id, canonical_title, added_at, in_library) VALUES
          ('shelf', 'Gardé', '2026-01-01', 1),
          ('browsed-old', 'Consulté', '2026-01-01', 0),
          ('browsed-new', 'Consulté récemment', '2026-10-08', 0),
          ('browsed-read', 'Lu sans signet', '2026-01-01', 0);
        INSERT INTO read_progress(library_entry_id, chapter_number, read_at)
          VALUES ('browsed-read', 1, '2026-01-02');
      `);
      sqlite.prepare(PRUNE_BROWSED_ENTRIES_SQL).run('2026-10-01');
      expect(
        sqlite
          .prepare('SELECT id FROM library_entries ORDER BY id')
          .all()
          .map((row) => row.id),
      ).toEqual(['browsed-new', 'browsed-read', 'shelf']);
    } finally {
      sqlite.close();
    }
  });
});
