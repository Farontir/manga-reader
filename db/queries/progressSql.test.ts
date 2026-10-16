import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';

import { initialMigration } from '../migrations/001_initial';
import { manualProgressMigration } from '../migrations/011_manual_progress';
import { MARK_READ_SQL, MARK_UNREAD_SQL } from './progressSql';

describe('marking chapters read from the list', () => {
  it('completes started chapters, adds manual ones, and forgets unread ones', async () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      const db = {
        execAsync: async (sql: string) => {
          sqlite.exec(sql);
        },
        getAllAsync: async (sql: string) => sqlite.prepare(sql).all(),
      } as unknown as SQLiteDatabase;
      await initialMigration(db);
      await manualProgressMigration(db);
      sqlite.exec(`
        INSERT INTO library_entries(id, canonical_title, added_at) VALUES ('m', 'Manga', '2026-10-01');
        INSERT INTO read_progress(library_entry_id, chapter_number, page_index, total_pages, read_at, completed)
          VALUES ('m', 2, 7, 20, '2026-10-10', 0), ('m', 5, 19, 20, '2026-10-11', 1);
      `);
      const markRead = sqlite.prepare(MARK_READ_SQL);
      for (const number of [1, 2]) markRead.run('m', number, '2026-10-16');
      sqlite.prepare(MARK_UNREAD_SQL).run('m', 5);
      expect(
        sqlite
          .prepare(
            `SELECT chapter_number AS number, page_index AS page, read_at AS readAt, completed, manual
             FROM read_progress ORDER BY chapter_number`,
          )
          .all(),
      ).toEqual([
        { number: 1, page: 0, readAt: '2026-10-16', completed: 1, manual: 1 },
        { number: 2, page: 7, readAt: '2026-10-10', completed: 1, manual: 0 },
      ]);
    } finally {
      sqlite.close();
    }
  });
});
