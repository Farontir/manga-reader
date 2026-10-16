import * as Crypto from 'expo-crypto';

import { getDatabase } from '../connection';
import type { LibraryEntry, SourceBinding } from '../schema';
import { PRUNE_BROWSED_ENTRIES_SQL } from './pruneSql';
import { listEntriesSql, type LibrarySort } from './librarySql';
import { sensitiveSql } from './sensitiveSql';

type EntryRow = {
  id: string;
  canonical_title: string;
  alt_titles_json: string;
  cover_url: string | null;
  anilist_id: number | null;
  description: string | null;
  status: string | null;
  added_at: string;
  last_read_at: string | null;
  in_library: number;
  details_json: string | null;
  content_rating: string | null;
  anilist_adult: number | null;
  user_sensitive_override: number | null;
};
type BindingRow = {
  id: string;
  library_entry_id: string;
  source_id: string;
  manga_id: string;
  priority: number;
  preferred: number;
  last_seen_ok: string | null;
  last_error: string | null;
};

function entryFromRow(row: EntryRow): LibraryEntry {
  let altTitles: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.alt_titles_json);
    if (Array.isArray(parsed)) altTitles = parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    /* Preserve the entry even if old JSON is malformed. */
  }
  return {
    id: row.id,
    canonicalTitle: row.canonical_title,
    altTitles,
    coverUrl: row.cover_url,
    anilistId: row.anilist_id,
    description: row.description,
    status: row.status,
    addedAt: row.added_at,
    lastReadAt: row.last_read_at,
    inLibrary: row.in_library !== 0,
    details: parseDetails(row.details_json),
    contentRating: row.content_rating ?? null,
    anilistAdult: flag(row.anilist_adult),
    sensitiveOverride: flag(row.user_sensitive_override),
  };
}

function flag(value: number | null | undefined): boolean | null {
  return value === null || value === undefined ? null : value === 1;
}

function flagValue(value: boolean | null): number | null {
  return value === null ? null : value ? 1 : 0;
}

function parseDetails(value: string | null): LibraryEntry['details'] {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as LibraryEntry['details']) : null;
  } catch {
    return null;
  }
}

function bindingFromRow(row: BindingRow): SourceBinding {
  return {
    id: row.id,
    libraryEntryId: row.library_entry_id,
    sourceId: row.source_id,
    mangaId: row.manga_id,
    priority: row.priority,
    preferred: row.preferred === 1,
    lastSeenOk: row.last_seen_ok,
    lastError: row.last_error,
  };
}

export type NewEntry = Pick<LibraryEntry, 'canonicalTitle'> &
  Partial<
    Pick<
      LibraryEntry,
      | 'altTitles'
      | 'coverUrl'
      | 'anilistId'
      | 'description'
      | 'status'
      | 'inLibrary'
      | 'contentRating'
      | 'anilistAdult'
    >
  >;

export async function createLibraryEntry(input: NewEntry): Promise<LibraryEntry> {
  const db = await getDatabase();
  const entry: LibraryEntry = {
    id: Crypto.randomUUID(),
    canonicalTitle: input.canonicalTitle.trim(),
    altTitles: input.altTitles ?? [],
    coverUrl: input.coverUrl ?? null,
    anilistId: input.anilistId ?? null,
    description: input.description ?? null,
    status: input.status ?? null,
    addedAt: new Date().toISOString(),
    lastReadAt: null,
    inLibrary: input.inLibrary ?? true,
    details: null,
    contentRating: input.contentRating ?? null,
    anilistAdult: input.anilistAdult ?? null,
    sensitiveOverride: null,
  };
  if (!entry.canonicalTitle) throw new Error('Le titre est obligatoire.');
  await db.runAsync(
    `INSERT INTO library_entries(id, canonical_title, alt_titles_json, cover_url, anilist_id,
      description, status, added_at, last_read_at, in_library, content_rating, anilist_adult)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.id,
    entry.canonicalTitle,
    JSON.stringify(entry.altTitles),
    entry.coverUrl,
    entry.anilistId,
    entry.description,
    entry.status,
    entry.addedAt,
    null,
    entry.inLibrary ? 1 : 0,
    entry.contentRating,
    flagValue(entry.anilistAdult),
  );
  return entry;
}

/**
 * Bookmarked entries by default; `all` also returns manga only opened from a source.
 * Sensitive manga only when included: screens pass the privacy lock state, background
 * work and backups always include them.
 */
export async function listLibraryEntries(options: {
  scope?: 'library' | 'all';
  includeSensitive: boolean;
  sort?: LibrarySort;
  /** A source id, LOCAL_FILES, or null for every manga. */
  source?: string | null;
}): Promise<LibraryEntry[]> {
  const db = await getDatabase();
  const { sql, params } = listEntriesSql(options.scope ?? 'library', options.includeSensitive, {
    sort: options.sort,
    source: options.source,
  });
  const rows = await db.getAllAsync<EntryRow>(sql, ...params);
  return rows.map(entryFromRow);
}

/** AniList ids of sensitive entries: their search results are hidden with them. */
export async function listSensitiveAniListIds(): Promise<Set<number>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ anilist_id: number }>(
    `SELECT anilist_id FROM library_entries
     WHERE anilist_id IS NOT NULL AND ${sensitiveSql()} = 1`,
  );
  return new Set(rows.map((row) => row.anilist_id));
}

/** The user's choice for one manga: sensitive, all audiences, or null for automatic. */
export async function setSensitiveOverride(id: string, value: boolean | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE library_entries SET user_sensitive_override = ? WHERE id = ?',
    flagValue(value),
    id,
  );
}

/** Stores the classification found on AniList and/or the sources (undefined = unchanged). */
export async function setEntryClassification(
  id: string,
  input: { contentRating?: string | null; anilistAdult?: boolean | null },
): Promise<void> {
  const db = await getDatabase();
  if (input.contentRating !== undefined) {
    await db.runAsync(
      'UPDATE library_entries SET content_rating = ? WHERE id = ?',
      input.contentRating,
      id,
    );
  }
  if (input.anilistAdult !== undefined) {
    await db.runAsync(
      'UPDATE library_entries SET anilist_adult = ? WHERE id = ?',
      flagValue(input.anilistAdult),
      id,
    );
  }
}

/** Stores fetched details, and the synopsis when one was found. */
export async function setEntryDetails(
  id: string,
  details: NonNullable<LibraryEntry['details']>,
  description: string | null,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE library_entries SET details_json = ?, description = COALESCE(?, description) WHERE id = ?',
    JSON.stringify(details),
    description,
    id,
  );
}

export async function setInLibrary(id: string, inLibrary: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE library_entries SET in_library = ? WHERE id = ?',
    inLibrary ? 1 : 0,
    id,
  );
}

/** Forgets manga only browsed (bindings and chapter lists cascade) before `cutoff`. */
export async function pruneBrowsedEntries(cutoff: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(PRUNE_BROWSED_ENTRIES_SQL, cutoff);
}

export async function getLibraryEntry(id: string): Promise<LibraryEntry | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<EntryRow>('SELECT * FROM library_entries WHERE id = ?', id);
  return row ? entryFromRow(row) : null;
}

export async function findEntryByAniListId(anilistId: number): Promise<LibraryEntry | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<EntryRow>(
    'SELECT * FROM library_entries WHERE anilist_id = ?',
    anilistId,
  );
  return row ? entryFromRow(row) : null;
}

export async function updateLibraryEntry(id: string, input: Partial<NewEntry>): Promise<void> {
  const current = await getLibraryEntry(id);
  if (!current) throw new Error('Manga introuvable.');
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE library_entries SET canonical_title = ?, alt_titles_json = ?, cover_url = ?,
      anilist_id = ?, description = ?, status = ? WHERE id = ?`,
    input.canonicalTitle?.trim() ?? current.canonicalTitle,
    JSON.stringify(input.altTitles ?? current.altTitles),
    input.coverUrl ?? current.coverUrl,
    input.anilistId ?? current.anilistId,
    input.description ?? current.description,
    input.status ?? current.status,
    id,
  );
}

export async function deleteLibraryEntry(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM library_entries WHERE id = ?', id);
}

export async function upsertBinding(
  input: Omit<SourceBinding, 'id' | 'lastSeenOk' | 'lastError' | 'preferred'>,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO source_bindings(id, library_entry_id, source_id, manga_id, priority)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(library_entry_id, source_id) DO UPDATE SET
       manga_id = excluded.manga_id, priority = excluded.priority, last_error = NULL`,
    Crypto.randomUUID(),
    input.libraryEntryId,
    input.sourceId,
    input.mangaId,
    input.priority,
  );
}

export async function listBindings(entryId: string): Promise<SourceBinding[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BindingRow>(
    'SELECT * FROM source_bindings WHERE library_entry_id = ? ORDER BY preferred DESC, priority DESC',
    entryId,
  );
  return rows.map(bindingFromRow);
}

export async function markBindingHealth(id: string, error: string | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE source_bindings SET last_seen_ok = ?, last_error = ? WHERE id = ?',
    error ? null : new Date().toISOString(),
    error,
    id,
  );
}

export async function setBindingPreferred(id: string, preferred: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE source_bindings SET preferred = ? WHERE id = ?', preferred ? 1 : 0, id);
}

export async function setBindingPriority(id: string, priority: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE source_bindings SET priority = ? WHERE id = ?', priority, id);
}
