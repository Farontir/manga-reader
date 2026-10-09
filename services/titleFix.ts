import { getSetting, listLibraryEntries, setSetting, updateLibraryEntry } from '../db';
import { fetchAniListTitles } from './anilist';
import { englishFirst } from './titles';

const DONE_KEY = 'titles.english.v1';

/**
 * One-time fix for entries added while AniList's romaji title was preferred (romanized
 * Korean for manhwa): switch them to their English title. Retried at next launch on failure.
 */
export async function preferEnglishTitles(): Promise<void> {
  if (await getSetting(DONE_KEY)) return;
  const entries = (await listLibraryEntries('all')).filter((entry) => entry.anilistId !== null);
  for (let start = 0; start < entries.length; start += 50) {
    const batch = entries.slice(start, start + 50);
    const titles = await fetchAniListTitles(batch.map((entry) => entry.anilistId as number));
    for (const entry of batch) {
      const update = englishFirst(entry, titles.get(entry.anilistId as number) ?? []);
      if (update) await updateLibraryEntry(entry.id, update);
    }
  }
  await setSetting(DONE_KEY, new Date().toISOString());
}
