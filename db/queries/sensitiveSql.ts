// SQL form of isSensitive (services/sensitive.ts) for one library_entries row, 1 or 0.
// Kept apart from library.ts so tests can run it against node:sqlite.
export function sensitiveSql(table = 'library_entries'): string {
  return `COALESCE(${table}.user_sensitive_override, CASE
    WHEN ${table}.content_rating IN ('erotica', 'pornographic') OR ${table}.anilist_adult = 1
    THEN 1 ELSE 0 END)`;
}

/** WHERE condition keeping only entries that are not sensitive. */
export function visibleSql(table = 'library_entries'): string {
  return `${sensitiveSql(table)} = 0`;
}

/** Library entries, most recently read first. */
export function listEntriesSql(scope: 'library' | 'all', includeSensitive: boolean): string {
  const conditions = [
    scope === 'library' ? 'in_library = 1' : '',
    includeSensitive ? '' : visibleSql(),
  ].filter(Boolean);
  return `SELECT * FROM library_entries
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY last_read_at DESC, added_at DESC`;
}
