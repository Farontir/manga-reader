import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';

import { initialMigration } from '../migrations/001_initial';
import { libraryBookmarkMigration } from '../migrations/007_library_bookmark';
import { entryDetailsMigration } from '../migrations/009_entry_details';
import { sensitiveContentMigration } from '../migrations/010_sensitive_content';
import { manualProgressMigration } from '../migrations/011_manual_progress';
import { readingSessionsMigration } from '../migrations/012_reading_sessions';
import {
  ADD_READING_TIME_SQL,
  CHAPTERS_READ_SQL,
  chaptersPerMangaSql,
  MANGA_COMPLETED_SQL,
  READING_TIME_SQL,
} from './statsSql';

describe('profile statistics', () => {
  it('counts reading time, chapters really read and completed manga', async () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      const db = {
        execAsync: async (sql: string) => {
          sqlite.exec(sql);
        },
        getAllAsync: async (sql: string) => sqlite.prepare(sql).all(),
      } as unknown as SQLiteDatabase;
      for (const migration of [
        initialMigration,
        libraryBookmarkMigration,
        entryDetailsMigration,
        sensitiveContentMigration,
        manualProgressMigration,
        readingSessionsMigration,
      ]) {
        await migration(db);
      }
      sqlite.exec(`
        INSERT INTO library_entries(id, canonical_title, added_at, status, details_json, content_rating) VALUES
          ('done', 'Fini', '2026-10-01', NULL, '{"status":"FINISHED","genres":["Action"]}', 'safe'),
          ('ongoing', 'En cours', '2026-10-01', 'RELEASING', NULL, 'safe'),
          ('left', 'Pas fini', '2026-10-01', 'FINISHED', NULL, 'safe'),
          ('adult', 'Sensible', '2026-10-01', NULL, '{"genres":["Smut"]}', 'erotica');
        INSERT INTO known_chapters(library_entry_id, source_id, chapter_id, chapter_number, fetched_at) VALUES
          ('done', 's', 'd1', 1, '2026-10-01'), ('done', 's', 'd2', 2, '2026-10-01'),
          ('left', 's', 'l1', 1, '2026-10-01'), ('left', 's', 'l2', 2, '2026-10-01');
        INSERT INTO read_progress(library_entry_id, chapter_number, page_index, read_at, completed, manual) VALUES
          ('done', 1, 9, '2026-10-02', 1, 0), ('done', 2, 9, '2026-10-03', 1, 1),
          ('ongoing', 1, 9, '2026-10-04', 1, 0), ('left', 1, 9, '2026-10-05', 1, 0),
          ('adult', 1, 9, '2026-10-06', 1, 0);
      `);
      const addTime = sqlite.prepare(ADD_READING_TIME_SQL);
      addTime.run('done', 1, '2026-10-02T10:00:00Z', 600);
      addTime.run('ongoing', 1, '2026-10-10T10:00:00Z', 300);
      expect(sqlite.prepare(READING_TIME_SQL).get('2026-10-09')).toEqual({
        total: 900,
        recent: 300,
      });
      // The manually marked chapter 2 of "done" is not counted, but completes the manga.
      expect(sqlite.prepare(CHAPTERS_READ_SQL).get()).toEqual({ count: 4 });
      expect(sqlite.prepare(MANGA_COMPLETED_SQL).get()).toEqual({ count: 1 });
      expect(sqlite.prepare(chaptersPerMangaSql(false)).all()).toHaveLength(3);
      expect(sqlite.prepare(chaptersPerMangaSql(true)).all()).toHaveLength(4);
    } finally {
      sqlite.close();
    }
  });
});
