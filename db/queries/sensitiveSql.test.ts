import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';

import { isSensitive } from '../../services/sensitive';
import { initialMigration } from '../migrations/001_initial';
import { libraryBookmarkMigration } from '../migrations/007_library_bookmark';
import { sensitiveContentMigration } from '../migrations/010_sensitive_content';
import { listEntriesSql, sensitiveSql } from './sensitiveSql';

async function openDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql: string) => {
      sqlite.exec(sql);
    },
    getAllAsync: async (sql: string) => sqlite.prepare(sql).all(),
  } as unknown as SQLiteDatabase;
  await initialMigration(db);
  await libraryBookmarkMigration(db);
  await sensitiveContentMigration(db);
  return sqlite;
}

const ratings = [null, 'safe', 'suggestive', 'erotica', 'pornographic'];
const flags = [null, false, true];

describe('sensitive content in SQL', () => {
  it('classifies every combination exactly like isSensitive', async () => {
    const sqlite = await openDatabase();
    try {
      const insert = sqlite.prepare(
        `INSERT INTO library_entries(id, canonical_title, added_at, content_rating,
          anilist_adult, user_sensitive_override) VALUES (?, 'Manga', '2026-10-01', ?, ?, ?)`,
      );
      const expected: Record<string, number> = {};
      let index = 0;
      for (const contentRating of ratings) {
        for (const anilistAdult of flags) {
          for (const sensitiveOverride of flags) {
            const id = `e${index++}`;
            const asInt = (value: boolean | null) => (value === null ? null : value ? 1 : 0);
            insert.run(id, contentRating, asInt(anilistAdult), asInt(sensitiveOverride));
            expected[id] = isSensitive({ contentRating, anilistAdult, sensitiveOverride }) ? 1 : 0;
          }
        }
      }
      const rows = sqlite
        .prepare(`SELECT id, ${sensitiveSql()} AS sensitive FROM library_entries`)
        .all() as { id: string; sensitive: number }[];
      expect(Object.fromEntries(rows.map((row) => [row.id, row.sensitive]))).toEqual(expected);
    } finally {
      sqlite.close();
    }
  });

  it('lists sensitive entries only when included', async () => {
    const sqlite = await openDatabase();
    try {
      sqlite.exec(`
        INSERT INTO library_entries(id, canonical_title, added_at, in_library, content_rating,
          anilist_adult, user_sensitive_override) VALUES
          ('safe', 'Tout public', '2026-10-01', 1, 'safe', 0, NULL),
          ('rated', 'Note sensible', '2026-10-02', 1, 'erotica', NULL, NULL),
          ('anilist', 'AniList adulte', '2026-10-03', 1, NULL, 1, NULL),
          ('marked', 'Marqué', '2026-10-04', 1, 'safe', 0, 1),
          ('cleared', 'Démarqué', '2026-10-05', 1, 'pornographic', 1, 0),
          ('browsed', 'Parcouru', '2026-10-06', 0, 'pornographic', NULL, NULL);
      `);
      const ids = (sql: string) =>
        (sqlite.prepare(sql).all() as { id: string }[]).map((row) => row.id).sort();
      expect(ids(listEntriesSql('library', false))).toEqual(['cleared', 'safe']);
      expect(ids(listEntriesSql('library', true))).toEqual([
        'anilist',
        'cleared',
        'marked',
        'rated',
        'safe',
      ]);
      expect(ids(listEntriesSql('all', false))).toEqual(['cleared', 'safe']);
      expect(ids(listEntriesSql('all', true))).toHaveLength(6);
    } finally {
      sqlite.close();
    }
  });
});
