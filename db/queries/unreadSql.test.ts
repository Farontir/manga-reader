import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';

import { initialMigration } from '../migrations/001_initial';
import { libraryBookmarkMigration } from '../migrations/007_library_bookmark';
import { UNREAD_COUNTS_SQL } from './unreadSql';

describe('unread chapter counts', () => {
  it('counts each known chapter once, minus completed ones, for bookmarked manga', async () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      const db = {
        execAsync: async (sql: string) => {
          sqlite.exec(sql);
        },
        getAllAsync: async (sql: string) => sqlite.prepare(sql).all(),
      } as unknown as SQLiteDatabase;
      await initialMigration(db);
      await libraryBookmarkMigration(db);
      sqlite.exec(`
        INSERT INTO library_entries(id, canonical_title, added_at, in_library) VALUES
          ('a', 'Suivi', '2026-10-01', 1),
          ('done', 'À jour', '2026-10-01', 1),
          ('browsed', 'Sans signet', '2026-10-01', 0);
        INSERT INTO local_chapters(library_entry_id, chapter_number, title, page_uris_json, imported_at)
          VALUES ('a', 1, 'Chapitre 1', '[]', '2026-10-01');
        INSERT INTO known_chapters(library_entry_id, source_id, chapter_id, chapter_number, fetched_at) VALUES
          ('a', 's1', 'x1', 1, '2026-10-01'),
          ('a', 's1', 'x2', 2, '2026-10-01'),
          ('a', 's2', 'y2', 2, '2026-10-01'),
          ('a', 's1', 'x3', 3, '2026-10-01'),
          ('done', 's1', 'd1', 1, '2026-10-01'),
          ('browsed', 's1', 'b1', 1, '2026-10-01');
        INSERT INTO read_progress(library_entry_id, chapter_number, page_index, read_at, completed) VALUES
          ('a', 1, 19, '2026-10-02', 1),
          ('a', 2, 4, '2026-10-02', 0),
          ('done', 1, 9, '2026-10-02', 1);
      `);
      expect(sqlite.prepare(UNREAD_COUNTS_SQL).all()).toEqual([{ id: 'a', unread: 2 }]);
    } finally {
      sqlite.close();
    }
  });
});
