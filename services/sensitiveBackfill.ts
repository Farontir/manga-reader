import { getSetting, listLibraryEntries, setEntryClassification, setSetting } from '../db';
import { fetchAniListAdult } from './anilist';
import { rateFromSources } from './entryDetails';

const DONE_KEY = 'sensitive.backfill.v1';

/**
 * One-time classification of entries added before it existed: AniList adult flags in
 * batches of 50, then the source rating of bookmarked entries still without one. Requests stay 700 ms apart; retried at next launch on failure.
 */
export async function classifyLibrary(): Promise<void> {
  if (await getSetting(DONE_KEY)) return;
  const entries = await listLibraryEntries({ scope: 'all', includeSensitive: true });
  const matched = entries.filter(
    (entry) => entry.anilistId !== null && entry.anilistAdult === null,
  );
  for (let start = 0; start < matched.length; start += 50) {
    const batch = matched.slice(start, start + 50);
    const flags = await fetchAniListAdult(batch.map((entry) => entry.anilistId as number));
    for (const entry of batch) {
      const adult = flags.get(entry.anilistId as number);
      if (adult !== undefined) await setEntryClassification(entry.id, { anilistAdult: adult });
    }
  }
  for (const entry of entries.filter((item) => item.inLibrary && !item.contentRating)) {
    try {
      await rateFromSources(entry.id);
    } catch {
      /* Unreachable sources: rated at the next details refresh. */
    }
  }
  await setSetting(DONE_KEY, new Date().toISOString());
}
