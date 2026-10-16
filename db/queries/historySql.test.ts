import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';

import { initialMigration } from '../migrations/001_initial';
import { libraryBookmarkMigration } from '../migrations/007_library_bookmark';
import { sensitiveContentMigration } from '../migrations/010_sensitive_content';
import { manualProgressMigration } from '../migrations/011_manual_progress';
import { HIDE_FROM_HISTORY_SQL, historySql } from './historySql';

describe('reading history', () => {
  it('lists opened chapters newest first, without manual or sensitive ones', async () => {
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
      await sensitiveContentMigration(db);
      await manualProgressMigration(db);
      sqlite.exec(`
        INSERT INTO library_entries(id, canonical_title, added_at, content_rating) VALUES
          ('a', 'Alpha', '2026-10-01', 'safe'), ('x', 'Sensible', '2026-10-01', 'erotica');
        INSERT INTO read_progress(library_entry_id, chapter_number, page_index, total_pages,
          read_at, completed, manual) VALUES
          ('a', 1, 19, 20, '2026-10-10T10:00:00Z', 1, 0),
          ('a', 2, 4, 20, '2026-10-12T10:00:00Z', 0, 0),
          ('a', 3, 0, NULL, '2026-10-13T10:00:00Z', 1, 1),
          ('x', 1, 2, 30, '2026-10-14T10:00:00Z', 0, 0);
      `);
      const chapters = (includeSensitive: boolean) =>
        (
          sqlite.prepare(historySql(includeSensitive)).all(10) as {
            title: string;
            chapterNumber: number;
          }[]
        ).map((row) => `${row.title} ${row.chapterNumber}`);
      expect(chapters(false)).toEqual(['Alpha 2', 'Alpha 1']);
      expect(chapters(true)).toEqual(['Sensible 1', 'Alpha 2', 'Alpha 1']);
      sqlite.prepare(HIDE_FROM_HISTORY_SQL).run('a', 2);
      expect(chapters(false)).toEqual(['Alpha 1']);
      expect(
        sqlite
          .prepare(
            "SELECT page_index AS page FROM read_progress WHERE chapter_number = 2 AND library_entry_id = 'a'",
          )
          .get(),
      ).toEqual({ page: 4 });
    } finally {
      sqlite.close();
    }
  });
});
