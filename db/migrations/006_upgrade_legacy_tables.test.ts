import { DatabaseSync } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';

import { initialMigration } from './001_initial';
import { repairSchemaMigration } from './004_repair_schema';
import { upgradeLegacyTablesMigration } from './006_upgrade_legacy_tables';

function wrap(sqlite: DatabaseSync): SQLiteDatabase {
  return {
    execAsync: async (sql: string) => {
      sqlite.exec(sql);
    },
    getAllAsync: async (sql: string) => sqlite.prepare(sql).all(),
  } as unknown as SQLiteDatabase;
}

function columns(sqlite: DatabaseSync, table: string): string[] {
  return sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => String(row.name));
}

// Draft schema of PROJECT.md §3.3 used by the first prototype.
const LEGACY_SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE library_entries (
    id TEXT PRIMARY KEY, canonical_title TEXT NOT NULL, alt_titles_json TEXT NOT NULL,
    cover_url TEXT, cover_local_path TEXT, anilist_id INTEGER, mal_id INTEGER,
    added_at TEXT NOT NULL, last_read_at TEXT, status TEXT, description TEXT
  );
  CREATE TABLE source_bindings (
    id TEXT PRIMARY KEY,
    library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL, manga_id_in_source TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0, last_seen_ok TEXT, last_error TEXT,
    UNIQUE(library_entry_id, source_id)
  );
  CREATE INDEX idx_bindings_entry ON source_bindings(library_entry_id);
  CREATE TABLE known_chapters (
    library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL, chapter_id_in_source TEXT NOT NULL, chapter_number REAL NOT NULL,
    volume REAL, name TEXT, lang_code TEXT, group_name TEXT, published_at TEXT,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY(library_entry_id, source_id, chapter_id_in_source)
  );
  CREATE TABLE installed_sources (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, language TEXT NOT NULL,
    content_rating TEXT NOT NULL, repo_url TEXT, bundle_path TEXT NOT NULL,
    installed_at TEXT NOT NULL, last_health_check TEXT, health_status TEXT
  );
  CREATE TABLE downloaded_chapters (
    library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
    chapter_number REAL NOT NULL, source_id TEXT NOT NULL, local_dir TEXT NOT NULL,
    page_count INTEGER NOT NULL, downloaded_at TEXT NOT NULL, size_bytes INTEGER,
    PRIMARY KEY(library_entry_id, chapter_number)
  );
  INSERT INTO library_entries(id, canonical_title, alt_titles_json, added_at)
    VALUES ('m1', 'One Piece', '[]', '2026-05-04');
  INSERT INTO source_bindings(id, library_entry_id, source_id, manga_id_in_source)
    VALUES ('b1', 'm1', 'org.mangadex.en', 'md-42');
  INSERT INTO known_chapters(library_entry_id, source_id, chapter_id_in_source, chapter_number,
    name, lang_code, fetched_at)
    VALUES ('m1', 'org.mangadex.en', 'c-1', 1, 'Romance Dawn', 'en', '2026-05-04');
  INSERT INTO installed_sources(id, name, version, language, content_rating, bundle_path,
    installed_at) VALUES ('old', 'Old', '0.1', 'en', 'safe', '/x/bundle.js', '2026-05-04');
`;

describe('legacy table upgrade migration', () => {
  it('rebuilds prototype tables, keeps their data and the legacy copies', async () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec(LEGACY_SCHEMA);
      const db = wrap(sqlite);
      await repairSchemaMigration(db);
      await upgradeLegacyTablesMigration(db);
      await upgradeLegacyTablesMigration(db);

      expect(columns(sqlite, 'installed_sources')).toContain('bundle_uri');
      expect(columns(sqlite, 'installed_sources')).toContain('manifest_json');
      expect(columns(sqlite, 'downloaded_chapters')).toContain('page_uris_json');
      expect(sqlite.prepare('SELECT id, manga_id FROM source_bindings').all()).toEqual([
        { id: 'b1', manga_id: 'md-42' },
      ]);
      expect(
        sqlite.prepare('SELECT chapter_id, title, language FROM known_chapters').all(),
      ).toEqual([{ chapter_id: 'c-1', title: 'Romance Dawn', language: 'en' }]);
      expect(sqlite.prepare('SELECT COUNT(*) AS n FROM installed_sources').get()).toEqual({
        n: 0,
      });
      expect(sqlite.prepare('SELECT id FROM installed_sources_legacy_v0').all()).toEqual([
        { id: 'old' },
      ]);
      const indexes = sqlite
        .prepare(
          "SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'",
        )
        .all();
      expect(indexes).toContainEqual({ name: 'idx_bindings_entry', tbl_name: 'source_bindings' });

      sqlite.exec(`INSERT INTO installed_sources(id, name, version, language, content_rating,
        repo_url, bundle_uri, manifest_json, installed_at)
        VALUES ('org.mangadex.en', 'MangaDex', '1.0.0', 'en', 'safe', 'https://x/manifest.json',
          'file:///bundle.js', '{}', '2026-09-27')`);
      sqlite.exec("DELETE FROM library_entries WHERE id = 'm1'");
      expect(sqlite.prepare('SELECT COUNT(*) AS n FROM source_bindings').get()).toEqual({ n: 0 });
    } finally {
      sqlite.close();
    }
  });

  it('leaves a current schema untouched', async () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      const db = wrap(sqlite);
      await initialMigration(db);
      await upgradeLegacyTablesMigration(db);
      const tables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%legacy%'")
        .all();
      expect(tables).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
