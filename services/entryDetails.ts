import { getInstalledSource, listBindings, setEntryDetails, type LibraryEntry } from '../db';
import { getSourceManga } from '../sources/api';
import { fetchAniListDetails } from './anilist';
import { cleanDescription } from './mangaDetails';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Fetches the manga page details when missing or older than a week: from AniList when the
 * entry is matched there, else from its first installed source. True when they changed.
 */
export async function refreshEntryDetails(entry: LibraryEntry): Promise<boolean> {
  const fetchedAt = entry.details?.fetchedAt ? Date.parse(entry.details.fetchedAt) : NaN;
  if (Number.isFinite(fetchedAt) && Date.now() - fetchedAt < MAX_AGE_MS) return false;
  const now = new Date().toISOString();
  if (entry.anilistId) {
    const { description, details } = await fetchAniListDetails(entry.anilistId);
    await setEntryDetails(entry.id, { ...details, fetchedAt: now }, description);
    return true;
  }
  for (const binding of await listBindings(entry.id)) {
    const source = await getInstalledSource(binding.sourceId);
    if (!source) continue;
    try {
      const manga = await getSourceManga(source, binding.mangaId);
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
      return true;
    } catch {
      /* Try the next source. */
    }
  }
  return false;
}
