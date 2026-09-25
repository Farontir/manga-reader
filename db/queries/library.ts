import * as Crypto from 'expo-crypto';

import { getDatabase } from '../connection';
import type { LibraryEntry, SourceBinding } from '../schema';

type EntryRow = {
  id: string; canonical_title: string; alt_titles_json: string; cover_url: string | null;
  anilist_id: number | null; description: string | null; status: string | null;
  added_at: string; last_read_at: string | null;
};
type BindingRow = {
  id: string; library_entry_id: string; source_id: string; manga_id: string;
  priority: number; last_seen_ok: string | null; last_error: string | null;
};

function entryFromRow(row: EntryRow): LibraryEntry {
  let altTitles: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.alt_titles_json);
    if (Array.isArray(parsed)) altTitles = parsed.filter((v): v is string => typeof v === 'string');
  } catch { /* Preserve the entry even if old JSON is malformed. */ }
  return {
    id: row.id, canonicalTitle: row.canonical_title, altTitles, coverUrl: row.cover_url,
    anilistId: row.anilist_id, description: row.description, status: row.status,
    addedAt: row.added_at, lastReadAt: row.last_read_at,
  };
}

function bindingFromRow(row: BindingRow): SourceBinding {
  return {
    id: row.id, libraryEntryId: row.library_entry_id, sourceId: row.source_id,
    mangaId: row.manga_id, priority: row.priority, lastSeenOk: row.last_seen_ok,
    lastError: row.last_error,
  };
}

export type NewEntry = Pick<LibraryEntry, 'canonicalTitle'> & Partial<Pick<LibraryEntry,
  'altTitles' | 'coverUrl' | 'anilistId' | 'description' | 'status'>>;

export async function createLibraryEntry(input: NewEntry): Promise<LibraryEntry> {
  const db = await getDatabase();
  const entry: LibraryEntry = {
    id: Crypto.randomUUID(), canonicalTitle: input.canonicalTitle.trim(),
    altTitles: input.altTitles ?? [], coverUrl: input.coverUrl ?? null,
    anilistId: input.anilistId ?? null, description: input.description ?? null,
    status: input.status ?? null, addedAt: new Date().toISOString(), lastReadAt: null,
  };
  if (!entry.canonicalTitle) throw new Error('Le titre est obligatoire.');
  await db.runAsync(
    `INSERT INTO library_entries(id, canonical_title, alt_titles_json, cover_url, anilist_id,
      description, status, added_at, last_read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.id, entry.canonicalTitle, JSON.stringify(entry.altTitles), entry.coverUrl,
    entry.anilistId, entry.description, entry.status, entry.addedAt, null,
  );
  return entry;
}

export async function listLibraryEntries(): Promise<LibraryEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<EntryRow>(
    'SELECT * FROM library_entries ORDER BY last_read_at DESC, added_at DESC',
  );
  return rows.map(entryFromRow);
}

export async function getLibraryEntry(id: string): Promise<LibraryEntry | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<EntryRow>('SELECT * FROM library_entries WHERE id = ?', id);
  return row ? entryFromRow(row) : null;
}

export async function findEntryByAniListId(anilistId: number): Promise<LibraryEntry | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<EntryRow>(
    'SELECT * FROM library_entries WHERE anilist_id = ?', anilistId,
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
    JSON.stringify(input.altTitles ?? current.altTitles), input.coverUrl ?? current.coverUrl,
    input.anilistId ?? current.anilistId, input.description ?? current.description,
    input.status ?? current.status, id,
  );
}

export async function deleteLibraryEntry(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM library_entries WHERE id = ?', id);
}

export async function upsertBinding(input: Omit<SourceBinding, 'id' | 'lastSeenOk' | 'lastError'>): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO source_bindings(id, library_entry_id, source_id, manga_id, priority)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(library_entry_id, source_id) DO UPDATE SET
       manga_id = excluded.manga_id, priority = excluded.priority, last_error = NULL`,
    Crypto.randomUUID(), input.libraryEntryId, input.sourceId, input.mangaId, input.priority,
  );
}

export async function listBindings(entryId: string): Promise<SourceBinding[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BindingRow>(
    'SELECT * FROM source_bindings WHERE library_entry_id = ? ORDER BY priority DESC', entryId,
  );
  return rows.map(bindingFromRow);
}

export async function markBindingHealth(id: string, error: string | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE source_bindings SET last_seen_ok = ?, last_error = ? WHERE id = ?',
    error ? null : new Date().toISOString(), error, id,
  );
}

export async function setBindingPriority(id: string, priority: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE source_bindings SET priority = ? WHERE id = ?', priority, id);
}
