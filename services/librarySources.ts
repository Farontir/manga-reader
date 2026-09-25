import {
  createLibraryEntry, findEntryByAniListId, getInstalledSource, getLibraryEntry,
  listBindings, listInstalledSources, markBindingHealth, replaceKnownChapters,
  upsertBinding, type LibraryEntry,
} from '../db';
import { getSourceChapters, searchSource } from '../sources/api';
import type { SourceManga } from '../sources/types';
import type { AniListManga } from './anilist';
import { searchAniList } from './anilist';
import { titlesMatch } from './matching';

export async function bindMatchingSources(entry: LibraryEntry): Promise<void> {
  const sources = await listInstalledSources();
  for (const source of sources) {
    try {
      const results = await searchSource(source, entry.canonicalTitle);
      const match = results.find((candidate) =>
        (entry.anilistId && candidate.anilistId === entry.anilistId) ||
        titlesMatch(entry.canonicalTitle, entry.altTitles, candidate.title, candidate.altTitles),
      );
      if (!match) continue;
      await upsertBinding({ libraryEntryId: entry.id, sourceId: source.id,
        mangaId: match.id, priority: 0 });
      await refreshSourceChapters(entry.id, source.id, match.id);
    } catch { /* One broken source does not block the library entry. */ }
  }
}

export async function addAniListManga(manga: AniListManga): Promise<LibraryEntry> {
  const existing = await findEntryByAniListId(manga.id);
  if (existing) return existing;
  const entry = await createLibraryEntry({
    canonicalTitle: manga.title, altTitles: manga.altTitles, coverUrl: manga.coverUrl,
    anilistId: manga.id, description: manga.description, status: manga.status,
  });
  await bindMatchingSources(entry);
  return entry;
}

export async function addSourceManga(sourceId: string, manga: SourceManga): Promise<LibraryEntry> {
  let matched: AniListManga | undefined;
  try {
    if (manga.anilistId) {
      matched = (await searchAniList(manga.title)).find((item) => item.id === manga.anilistId);
    } else {
      matched = (await searchAniList(manga.title)).find((item) =>
        titlesMatch(item.title, item.altTitles, manga.title, manga.altTitles));
    }
  } catch { /* AniList can be unavailable; keep the source manga usable. */ }
  const existing = matched ? await findEntryByAniListId(matched.id) : null;
  const entry = existing ?? await createLibraryEntry({
    canonicalTitle: matched?.title ?? manga.title,
    altTitles: matched?.altTitles ?? manga.altTitles,
    coverUrl: matched?.coverUrl ?? manga.coverUrl,
    description: matched?.description ?? manga.description,
    anilistId: matched?.id ?? null,
  });
  await upsertBinding({ libraryEntryId: entry.id, sourceId, mangaId: manga.id, priority: 1 });
  try { await refreshSourceChapters(entry.id, sourceId, manga.id); }
  catch { /* The entry and binding remain, so the user can retry later. */ }
  return entry;
}

async function refreshSourceChapters(entryId: string, sourceId: string, mangaId: string): Promise<void> {
  const source = await getInstalledSource(sourceId);
  if (!source) return;
  const bindings = await listBindings(entryId);
  const binding = bindings.find((item) => item.sourceId === sourceId);
  try {
    const chapters = await getSourceChapters(source, mangaId);
    await replaceKnownChapters(entryId, sourceId, chapters.map((chapter) => ({
      chapterId: chapter.id, number: chapter.number, title: chapter.title ?? null,
      language: chapter.language ?? null, publishedAt: chapter.publishedAt ?? null,
    })));
    if (binding) await markBindingHealth(binding.id, null);
  } catch (reason) {
    if (binding) await markBindingHealth(binding.id, reason instanceof Error ? reason.message : String(reason));
    throw reason;
  }
}

export async function refreshEntryChapters(entryId: string): Promise<void> {
  const entry = await getLibraryEntry(entryId);
  if (!entry) throw new Error('Manga introuvable.');
  const bindings = await listBindings(entryId);
  let success = 0;
  for (const binding of bindings) {
    try { await refreshSourceChapters(entryId, binding.sourceId, binding.mangaId); success += 1; }
    catch { /* Try the next binding. */ }
  }
  if (bindings.length && !success) throw new Error('Toutes les sources liées sont indisponibles.');
}
