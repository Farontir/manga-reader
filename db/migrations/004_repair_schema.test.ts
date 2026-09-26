import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';

import { repairSchemaMigration } from './004_repair_schema';

describe('schema repair migration', () => {
  it('adds missing import tables without replacing existing library entries', async () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec(`
        CREATE TABLE library_entries (
          id TEXT PRIMARY KEY, canonical_title TEXT NOT NULL, alt_titles_json TEXT NOT NULL,
          cover_url TEXT, anilist_id INTEGER, description TEXT, status TEXT,
          added_at TEXT NOT NULL, last_read_at TEXT
        );
        INSERT INTO library_entries(id, canonical_title, alt_titles_json, added_at)
          VALUES ('saved-manga', 'Manga existant', '[]', '2026-01-01');
      `);
      const db = {
        execAsync: async (sql: string) => {
          sqlite.exec(sql);
        },
      } as SQLiteDatabase;

      await repairSchemaMigration(db);
      await repairSchemaMigration(db);

      const tables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name);
      expect(tables).toContain('local_chapters');
      expect(tables).toContain('settings');
      expect(tables).toContain('download_jobs');
      expect(
        sqlite
          .prepare('SELECT canonical_title FROM library_entries WHERE id = ?')
          .get('saved-manga'),
      ).toMatchObject({ canonical_title: 'Manga existant' });
    } finally {
      sqlite.close();
    }
  });
});
