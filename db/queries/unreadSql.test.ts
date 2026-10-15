import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';

import { initialMigration } from '../migrations/001_initial';
import { libraryBookmarkMigration } from '../migrations/007_library_bookmark';
import { preferredSourcesMigration } from '../migrations/008_preferred_sources';
import { sensitiveContentMigration } from '../migrations/010_sensitive_content';
import { unreadCountsSql } from './unreadSql';

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
      await preferredSourcesMigration(db);
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
      expect(sqlite.prepare(unreadCountsSql(true)).all()).toEqual([{ id: 'a', unread: 2 }]);
    } finally {
      sqlite.close();
    }
  });

  it('counts only preferred sources when some are preferred', async () => {
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
      await preferredSourcesMigration(db);
      sqlite.exec(`
        INSERT INTO library_entries(id, canonical_title, added_at, in_library)
          VALUES ('m', 'Manga', '2026-10-01', 1);
        INSERT INTO source_bindings(id, library_entry_id, source_id, manga_id, preferred) VALUES
          ('b1', 'm', 'fast', 'f', 1),
          ('b2', 'm', 'slow', 's', 0);
        INSERT INTO known_chapters(library_entry_id, source_id, chapter_id, chapter_number, fetched_at) VALUES
          ('m', 'fast', 'f1', 1, '2026-10-01'),
          ('m', 'fast', 'f2', 2, '2026-10-01'),
          ('m', 'slow', 's1', 1, '2026-10-01'),
          ('m', 'slow', 's9', 9, '2026-10-01');
      `);
      expect(sqlite.prepare(unreadCountsSql(true)).all()).toEqual([{ id: 'm', unread: 2 }]);
    } finally {
      sqlite.close();
    }
  });

  it('leaves sensitive manga out of the counts unless included', async () => {
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
      await preferredSourcesMigration(db);
      await sensitiveContentMigration(db);
      sqlite.exec(`
        INSERT INTO library_entries(id, canonical_title, added_at, in_library, content_rating)
          VALUES ('safe', 'Tout public', '2026-10-01', 1, 'safe'),
            ('adult', 'Sensible', '2026-10-01', 1, 'pornographic');
        INSERT INTO local_chapters(library_entry_id, chapter_number, title, page_uris_json, imported_at)
          VALUES ('safe', 1, 'Chapitre 1', '[]', '2026-10-01'),
            ('adult', 1, 'Chapitre 1', '[]', '2026-10-01');
      `);
      expect(sqlite.prepare(unreadCountsSql(false)).all()).toEqual([{ id: 'safe', unread: 1 }]);
      expect(sqlite.prepare(unreadCountsSql(true)).all()).toHaveLength(2);
    } finally {
      sqlite.close();
    }
  });
});
