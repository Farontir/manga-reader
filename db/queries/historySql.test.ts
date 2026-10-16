import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';

import { initialMigration } from '../migrations/001_initial';
import { libraryBookmarkMigration } from '../migrations/007_library_bookmark';
import { sensitiveContentMigration } from '../migrations/010_sensitive_content';
import { manualProgressMigration } from '../migrations/011_manual_progress';
import { historyHiddenMigration } from '../migrations/013_history_hidden';
import { HIDE_FROM_HISTORY_SQL, historySql } from './historySql';

describe('reading history', () => {
  it('shows one line per manga with its last chapter and the next one', async () => {
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
      await historyHiddenMigration(db);
      sqlite.exec(`
        INSERT INTO library_entries(id, canonical_title, added_at, content_rating) VALUES
          ('a', 'Alpha', '2026-10-01', 'safe'), ('b', 'Beta', '2026-10-01', 'safe'),
          ('x', 'Sensible', '2026-10-01', 'erotica');
        INSERT INTO known_chapters(library_entry_id, source_id, chapter_id, chapter_number, fetched_at)
          VALUES ('a', 's', 'a1', 1, '2026-10-01'), ('a', 's', 'a2', 2, '2026-10-01'),
            ('a', 's', 'a3', 3, '2026-10-01');
        INSERT INTO local_chapters(library_entry_id, chapter_number, title, page_uris_json, imported_at)
          VALUES ('a', 2.5, 'Chapitre 2.5', '[]', '2026-10-01');
        INSERT INTO read_progress(library_entry_id, chapter_number, page_index, total_pages,
          read_at, completed, manual) VALUES
          ('a', 1, 19, 20, '2026-10-10T10:00:00Z', 1, 0),
          ('a', 2, 19, 20, '2026-10-12T10:00:00Z', 1, 0),
          ('a', 3, 0, NULL, '2026-10-15T10:00:00Z', 1, 1),
          ('b', 7, 4, 30, '2026-10-13T10:00:00Z', 0, 0),
          ('x', 1, 2, 30, '2026-10-14T10:00:00Z', 0, 0);
      `);
      type Row = { title: string; chapterNumber: number; nextChapter: number | null };
      const lines = (includeSensitive: boolean) =>
        (sqlite.prepare(historySql(includeSensitive)).all(10) as Row[]).map((row) => [
          row.title,
          row.chapterNumber,
          row.nextChapter,
        ]);
      // Alpha: chapter 2 (chapter 3 was only marked read), continued by the local 2.5.
      expect(lines(false)).toEqual([
        ['Beta', 7, null],
        ['Alpha', 2, 2.5],
      ]);
      expect(lines(true).map(([title]) => title)).toEqual(['Sensible', 'Beta', 'Alpha']);

      // Removed: hidden with its progress kept, back once read again.
      sqlite.prepare(HIDE_FROM_HISTORY_SQL).run('2026-10-16T00:00:00Z', 'b');
      expect(lines(false).map(([title]) => title)).toEqual(['Alpha']);
      expect(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM read_progress WHERE library_entry_id = 'b'")
          .get(),
      ).toEqual({ count: 1 });
      sqlite.exec(
        `UPDATE read_progress SET read_at = '2026-10-17T09:00:00Z' WHERE library_entry_id = 'b'`,
      );
      expect(lines(false).map(([title]) => title)).toEqual(['Beta', 'Alpha']);
    } finally {
      sqlite.close();
    }
  });
});
