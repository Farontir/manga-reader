import { normalizeTitle } from './matching';

type Searchable = { id: string; canonicalTitle: string; altTitles: string[] };

/** Entries whose title or an alternative title contains every word of the query. */
export function filterLibrary<T extends Searchable>(entries: T[], query: string): T[] {
  const words = normalizeTitle(query).split(' ').filter(Boolean);
  if (!words.length) return entries;
  return entries.filter((entry) => {
    const titles = [entry.canonicalTitle, ...entry.altTitles].map(normalizeTitle);
    return titles.some((title) => words.every((word) => title.includes(word)));
  });
}

/** Manga with unread chapters first (most unread first), the given order kept otherwise. */
export function unreadFirst<T extends Searchable>(
  entries: T[],
  unread: Record<string, number>,
): T[] {
  return entries
    .map((entry, index) => ({ entry, index, count: unread[entry.id] ?? 0 }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map(({ entry }) => entry);
}
