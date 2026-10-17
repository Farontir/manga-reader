import {
  createLibraryEntry,
  findEntryByAniListId,
  getInstalledSource,
  getLibraryEntry,
  listBindings,
  listInstalledSources,
  listLibraryEntries,
  markBindingHealth,
  replaceKnownChapters,
  setEntryClassification,
  upsertBinding,
  type InstalledSource,
  type LibraryEntry,
} from '../db';
import { getSourceChapters, searchSource } from '../sources/api';
import type { SourceManga } from '../sources/types';
import type { AniListManga } from './anilist';
import { searchAniList } from './anilist';
import { titlesMatch } from './matching';
import { sourceMangaRating, strictestRating } from './sensitive';

/** Keeps the strictest rating given by the sources bound to an entry. */
export async function rateEntryFromSource(entryId: string, manga: SourceManga): Promise<void> {
  const rating = sourceMangaRating(manga);
  if (!rating) return;
  const entry = await getLibraryEntry(entryId);
  if (!entry) return;
  const strictest = strictestRating(entry.contentRating, rating);
  if (strictest !== entry.contentRating) {
    await setEntryClassification(entryId, { contentRating: strictest });
  }
}

export async function bindMatchingSources(entry: LibraryEntry): Promise<void> {
  const sources = await listInstalledSources();
  for (const source of sources) {
    try {
      const results = await searchSource(source, entry.canonicalTitle);
      const match = results.find(
        (candidate) =>
          (entry.anilistId && candidate.anilistId === entry.anilistId) ||
          titlesMatch(entry.canonicalTitle, entry.altTitles, candidate.title, candidate.altTitles),
      );
      if (!match) continue;
      await upsertBinding({
        libraryEntryId: entry.id,
        sourceId: source.id,
        mangaId: match.id,
        priority: 0,
      });
      await rateEntryFromSource(entry.id, match);
      await refreshSourceChapters(entry.id, source.id, match.id);
    } catch {
      /* One broken source does not block the library entry. */
    }
  }
}

export async function matchSourceToLibrary(source: InstalledSource): Promise<number> {
  const entries = await listLibraryEntries({ includeSensitive: true });
  let count = 0;
  for (const entry of entries) {
    try {
      const current = await listBindings(entry.id);
      const existing = current.find((binding) => binding.sourceId === source.id);
      if (existing) {
        await refreshSourceChapters(entry.id, source.id, existing.mangaId);
        count += 1;
        continue;
      }
      const results = await searchSource(source, entry.canonicalTitle);
      const match = results.find(
        (candidate) =>
          (entry.anilistId && candidate.anilistId === entry.anilistId) ||
          titlesMatch(entry.canonicalTitle, entry.altTitles, candidate.title, candidate.altTitles),
      );
      if (!match) continue;
      await upsertBinding({
        libraryEntryId: entry.id,
        sourceId: source.id,
        mangaId: match.id,
        priority: 0,
      });
      await rateEntryFromSource(entry.id, match);
      await refreshSourceChapters(entry.id, source.id, match.id);
      count += 1;
    } catch {
      /* Continue with the next library entry. */
    }
  }
  return count;
}

/**
 * Entry to open for an AniList result. A new entry is not bookmarked: it only reaches the
 * library through the bookmark on its page.
 */
export async function openAniListManga(manga: AniListManga): Promise<LibraryEntry> {
  const existing = await findEntryByAniListId(manga.id);
  if (existing) return existing;
  const entry = await createLibraryEntry({
    canonicalTitle: manga.title,
    altTitles: manga.altTitles,
    coverUrl: manga.coverUrl,
    anilistId: manga.id,
    description: manga.description,
    status: manga.status,
    inLibrary: false,
    // AniList search leaves adult titles out (isAdult: false).
    anilistAdult: false,
  });
  await bindMatchingSources(entry);
  return entry;
}

/** Entry to open for a source result (matched on AniList), not bookmarked when new. */
export async function openSourceManga(sourceId: string, manga: SourceManga): Promise<LibraryEntry> {
  let matched: AniListManga | undefined;
  try {
    if (manga.anilistId) {
      matched = (await searchAniList(manga.title)).find((item) => item.id === manga.anilistId);
    } else {
      matched = (await searchAniList(manga.title)).find((item) =>
        titlesMatch(item.title, item.altTitles, manga.title, manga.altTitles),
      );
    }
  } catch {
    /* AniList can be unavailable; keep the source manga usable. */
  }
  const existing = matched ? await findEntryByAniListId(matched.id) : null;
  const entry =
    existing ??
    (await createLibraryEntry({
      canonicalTitle: matched?.title ?? manga.title,
      altTitles: matched?.altTitles ?? manga.altTitles,
      coverUrl: matched?.coverUrl ?? manga.coverUrl,
      description: matched?.description ?? manga.description,
      anilistId: matched?.id ?? null,
      inLibrary: false,
      anilistAdult: matched ? false : null,
      contentRating: sourceMangaRating(manga),
    }));
  await upsertBinding({ libraryEntryId: entry.id, sourceId, mangaId: manga.id, priority: 1 });
  if (existing) await rateEntryFromSource(entry.id, manga);
  // The entry screen loads chapters after navigation. Waiting for a large
  // chapter list here makes tapping a Discover cover feel unresponsive.
  return entry;
}

/** Binds one source's manga to an entry and loads its chapter list (best effort). */
async function bindSourceManga(
  entryId: string,
  sourceId: string,
  manga: SourceManga,
): Promise<void> {
  await upsertBinding({ libraryEntryId: entryId, sourceId, mangaId: manga.id, priority: 0 });
  await rateEntryFromSource(entryId, manga);
  try {
    await refreshSourceChapters(entryId, sourceId, manga.id);
  } catch {
    /* The binding remains, so the user can refresh later. */
  }
}

/**
 * Entry to open for a grouped search result: the AniList identity when known, and every
 * source that offered the manga bound at once (no second search). Not bookmarked when new.
 */
export async function openSearchGroup(group: {
  anilist: AniListManga | null;
  sources: { source: { id: string }; manga: SourceManga }[];
}): Promise<LibraryEntry> {
  if (group.anilist) {
    if (!group.sources.length) return openAniListManga(group.anilist);
    const manga = group.anilist;
    const entry =
      (await findEntryByAniListId(manga.id)) ??
      (await createLibraryEntry({
        canonicalTitle: manga.title,
        altTitles: manga.altTitles,
        coverUrl: manga.coverUrl,
        anilistId: manga.id,
        description: manga.description,
        status: manga.status,
        inLibrary: false,
        anilistAdult: false,
      }));
    for (const { source, manga: found } of group.sources) {
      await bindSourceManga(entry.id, source.id, found);
    }
    return entry;
  }
  const [first, ...others] = group.sources;
  if (!first) throw new Error('Résultat vide.');
  const entry = await openSourceManga(first.source.id, first.manga);
  for (const { source, manga } of others) await bindSourceManga(entry.id, source.id, manga);
  return entry;
}

async function refreshSourceChapters(
  entryId: string,
  sourceId: string,
  mangaId: string,
): Promise<void> {
  const source = await getInstalledSource(sourceId);
  if (!source) return;
  const bindings = await listBindings(entryId);
  const binding = bindings.find((item) => item.sourceId === sourceId);
  try {
    const chapters = await getSourceChapters(source, mangaId);
    await replaceKnownChapters(
      entryId,
      sourceId,
      chapters.map((chapter) => ({
        chapterId: chapter.id,
        number: chapter.number,
        title: chapter.title ?? null,
        language: chapter.language ?? null,
        publishedAt: chapter.publishedAt ?? null,
      })),
    );
    if (binding) await markBindingHealth(binding.id, null);
  } catch (reason) {
    if (binding)
      await markBindingHealth(
        binding.id,
        reason instanceof Error ? reason.message : String(reason),
      );
    throw reason;
  }
}

export async function refreshEntryChapters(entryId: string): Promise<void> {
  const entry = await getLibraryEntry(entryId);
  if (!entry) throw new Error('Manga introuvable.');
  const bindings = await listBindings(entryId);
  let success = 0;
  for (const binding of bindings) {
    try {
      await refreshSourceChapters(entryId, binding.sourceId, binding.mangaId);
      success += 1;
    } catch {
      /* Try the next binding. */
    }
  }
  if (bindings.length && !success) throw new Error('Toutes les sources liées sont indisponibles.');
}
