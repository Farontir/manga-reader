import type { SQLiteDatabase } from 'expo-sqlite';

// Installs created by the first prototype (May 2026) followed the draft schema of
// PROJECT.md §3.3 (bundle_path, manga_id_in_source, chapter_id_in_source, local_dir…).
// Their migration marker skipped 001, and 004 only recreates missing tables, so these
// tables kept columns the app no longer writes. A legacy table is renamed to
// `<table>_legacy_v0` (nothing is dropped), recreated with the current layout, and
// its rows are copied when every required column has a counterpart.

type TableUpgrade = {
  table: string;
  /** Columns the app reads and writes; the table is legacy when one is missing. */
  columns: string[];
  create: string;
  indexes: string[];
  /** Target column -> candidate source columns, first present wins. */
  copy?: Record<string, string[]>;
  /** Copied targets that may stay empty; rows are copied only if all others are found. */
  optional?: string[];
};

const TABLES: TableUpgrade[] = [
  {
    table: 'source_bindings',
    columns: ['id', 'library_entry_id', 'source_id', 'manga_id', 'priority'],
    create: `CREATE TABLE source_bindings (
      id TEXT PRIMARY KEY,
      library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      manga_id TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      last_seen_ok TEXT,
      last_error TEXT,
      UNIQUE(library_entry_id, source_id)
    )`,
    indexes: [
      'CREATE INDEX idx_bindings_entry ON source_bindings(library_entry_id)',
      'CREATE INDEX idx_bindings_source ON source_bindings(source_id)',
    ],
    copy: {
      id: ['id'],
      library_entry_id: ['library_entry_id'],
      source_id: ['source_id'],
      manga_id: ['manga_id', 'manga_id_in_source'],
      priority: ['priority'],
      last_seen_ok: ['last_seen_ok'],
      last_error: ['last_error'],
    },
    optional: ['priority', 'last_seen_ok', 'last_error'],
  },
  {
    table: 'known_chapters',
    columns: ['library_entry_id', 'source_id', 'chapter_id', 'chapter_number', 'title', 'language'],
    create: `CREATE TABLE known_chapters (
      library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_number REAL NOT NULL,
      title TEXT,
      language TEXT,
      published_at TEXT,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY(library_entry_id, source_id, chapter_id)
    )`,
    indexes: [
      'CREATE INDEX idx_chapters_entry_number ON known_chapters(library_entry_id, chapter_number)',
    ],
    copy: {
      library_entry_id: ['library_entry_id'],
      source_id: ['source_id'],
      chapter_id: ['chapter_id', 'chapter_id_in_source'],
      chapter_number: ['chapter_number'],
      title: ['title', 'name'],
      language: ['language', 'lang_code'],
      published_at: ['published_at'],
      fetched_at: ['fetched_at'],
    },
    optional: ['title', 'language', 'published_at'],
  },
  {
    // Legacy rows lack the manifest and bundle location: sources must be reinstalled.
    table: 'installed_sources',
    columns: ['id', 'repo_url', 'bundle_uri', 'manifest_json'],
    create: `CREATE TABLE installed_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      language TEXT NOT NULL,
      content_rating TEXT NOT NULL,
      repo_url TEXT NOT NULL,
      bundle_uri TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      installed_at TEXT NOT NULL,
      last_health_check TEXT,
      health_status TEXT
    )`,
    indexes: [],
  },
  {
    // Legacy rows point to a directory, not to page files: chapters must be downloaded again.
    table: 'downloaded_chapters',
    columns: ['library_entry_id', 'chapter_number', 'source_id', 'page_uris_json'],
    create: `CREATE TABLE downloaded_chapters (
      library_entry_id TEXT NOT NULL REFERENCES library_entries(id) ON DELETE CASCADE,
      chapter_number REAL NOT NULL,
      source_id TEXT NOT NULL,
      page_uris_json TEXT NOT NULL,
      downloaded_at TEXT NOT NULL,
      size_bytes INTEGER,
      PRIMARY KEY(library_entry_id, chapter_number)
    )`,
    indexes: [],
  },
];

function indexName(statement: string): string {
  return /CREATE INDEX (\w+)/.exec(statement)?.[1] ?? '';
}

async function tableColumns(db: SQLiteDatabase, table: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map((row) => row.name));
}

export async function upgradeLegacyTablesMigration(db: SQLiteDatabase): Promise<void> {
  for (const upgrade of TABLES) {
    const existing = await tableColumns(db, upgrade.table);
    if (!existing.size || upgrade.columns.every((column) => existing.has(column))) continue;

    const legacy = `${upgrade.table}_legacy_v0`;
    await db.execAsync(`ALTER TABLE ${upgrade.table} RENAME TO ${legacy}`);
    // Indexes follow the renamed table and keep their names; free the names 001 uses.
    for (const statement of upgrade.indexes) {
      await db.execAsync(`DROP INDEX IF EXISTS ${indexName(statement)}`);
    }
    await db.execAsync(upgrade.create);
    for (const statement of upgrade.indexes) await db.execAsync(statement);

    if (!upgrade.copy) continue;
    const pairs = Object.entries(upgrade.copy).map(
      ([target, sources]) => [target, sources.find((source) => existing.has(source))] as const,
    );
    if (pairs.some(([target, source]) => !source && !upgrade.optional?.includes(target))) continue;
    const targets = pairs.filter((pair): pair is readonly [string, string] => !!pair[1]);
    // OR IGNORE skips rows with NULL required values; orphans would break the foreign key.
    await db.execAsync(
      `INSERT OR IGNORE INTO ${upgrade.table}(${targets.map(([target]) => target).join(', ')})
       SELECT ${targets.map(([, source]) => source).join(', ')} FROM ${legacy}
       WHERE library_entry_id IN (SELECT id FROM library_entries)`,
    );
  }
}
