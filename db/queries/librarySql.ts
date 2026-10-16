import { visibleSql } from './sensitiveSql';

/** Library orders; "unread first" is applied on top of the reading order with the counts. */
export type LibrarySort = 'read' | 'added' | 'title' | 'unread';

/** Source filter value for manga that have local files. */
export const LOCAL_FILES = ':local';

const ORDER: Record<LibrarySort, string> = {
  read: 'last_read_at DESC, added_at DESC',
  added: 'added_at DESC',
  title: 'canonical_title COLLATE NOCASE ASC',
  unread: 'last_read_at DESC, added_at DESC',
};

/**
 * Library entries query. `source` keeps manga bound to that source (or with local files
 * for LOCAL_FILES). Kept apart from library.ts so tests can run it against node:sqlite.
 */
export function listEntriesSql(
  scope: 'library' | 'all',
  includeSensitive: boolean,
  options: { sort?: LibrarySort; source?: string | null } = {},
): { sql: string; params: string[] } {
  const params: string[] = [];
  const conditions = [
    scope === 'library' ? 'in_library = 1' : '',
    includeSensitive ? '' : visibleSql(),
  ];
  if (options.source === LOCAL_FILES) {
    conditions.push(
      'EXISTS (SELECT 1 FROM local_chapters WHERE library_entry_id = library_entries.id)',
    );
  } else if (options.source) {
    conditions.push(
      `EXISTS (SELECT 1 FROM source_bindings
        WHERE library_entry_id = library_entries.id AND source_id = ?)`,
    );
    params.push(options.source);
  }
  const where = conditions.filter(Boolean);
  return {
    sql: `SELECT * FROM library_entries
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${ORDER[options.sort ?? 'read']}`,
    params,
  };
}
