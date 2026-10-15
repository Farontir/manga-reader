import {
  getInstalledSource,
  listBindings,
  setEntryClassification,
  setEntryDetails,
  type LibraryEntry,
} from '../db';
import { getSourceManga } from '../sources/api';
import type { SourceManga } from '../sources/types';
import { fetchAniListDetails } from './anilist';
import { rateEntryFromSource } from './librarySources';
import { cleanDescription } from './mangaDetails';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** The manga as its first reachable installed source describes it. */
async function firstSourceManga(entryId: string): Promise<SourceManga | null> {
  for (const binding of await listBindings(entryId)) {
    const source = await getInstalledSource(binding.sourceId);
    if (!source) continue;
    try {
      return await getSourceManga(source, binding.mangaId);
    } catch {
      /* Try the next source. */
    }
  }
  return null;
}

/** Rates an entry from its first reachable source, without touching its details. */
export async function rateFromSources(entryId: string): Promise<void> {
  const manga = await firstSourceManga(entryId);
  if (manga) await rateEntryFromSource(entryId, manga);
}

/**
 * Fetches the manga page details when missing or older than a week:
 * from AniList when the entry is matched there, else from its first installed source.
 * Also classifies the entry (AniList adult flag, source rating). True when they changed.
 */
export async function refreshEntryDetails(entry: LibraryEntry): Promise<boolean> {
  const fetchedAt = entry.details?.fetchedAt ? Date.parse(entry.details.fetchedAt) : NaN;
  if (Number.isFinite(fetchedAt) && Date.now() - fetchedAt < MAX_AGE_MS) return false;
  const now = new Date().toISOString();
  if (entry.anilistId) {
    const { description, details, adult } = await fetchAniListDetails(entry.anilistId);
    await setEntryDetails(entry.id, { ...details, fetchedAt: now }, description);
    await setEntryClassification(entry.id, { anilistAdult: adult });
    if (!entry.contentRating) await rateFromSources(entry.id);
    return true;
  }
  const manga = await firstSourceManga(entry.id);
  if (!manga) return false;
  await setEntryDetails(
    entry.id,
    {
      genres: manga.genres ?? [],
      authors: manga.authors ?? [],
      status: null,
      format: null,
      country: null,
      year: null,
      score: null,
      chapters: null,
      fetchedAt: now,
    },
    cleanDescription(manga.description),
  );
  await rateEntryFromSource(entry.id, manga);
  return true;
}
