import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { listInstalledSources, listSensitiveAniListIds, type InstalledSource } from '../db';
import { searchAniList, type AniListManga } from '../services/anilist';
import { openSearchGroup } from '../services/librarySources';
import { groupSearchResults, type SearchGroup, type SearchHit } from '../services/searchGroups';
import { isSensitiveSourceManga } from '../services/sensitive';
import { tolerantSearch } from '../services/tolerantSearch';
import { searchSource } from '../sources/api';
import { useShowSensitive } from './privacy';

export type SearchResult = SearchGroup<InstalledSource>;

/** Search across AniList and every installed source, one result per manga. */
export function useGlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  // The last term searched: results are shown from the first search until cleared.
  const [searched, setSearched] = useState<string | null>(null);
  const [sources, setSources] = useState<InstalledSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(0);
  const showSensitive = useShowSensitive();
  const [sensitiveIds, setSensitiveIds] = useState<Set<number>>(new Set());
  useFocusEffect(
    useCallback(() => {
      void listInstalledSources().then(setSources);
      void listSensitiveAniListIds().then(setSensitiveIds);
    }, []),
  );
  // While sensitive content is hidden, so are results rated sensitive by a source or
  // matching a sensitive manga of the library (AniList itself returns no adult title).
  const shown = useMemo(
    () =>
      showSensitive
        ? results
        : results.filter(
            (result) =>
              !(result.anilist && sensitiveIds.has(result.anilist.id)) &&
              !result.sources.some(({ manga }) => isSensitiveSourceManga(manga)),
          ),
    [results, sensitiveIds, showSensitive],
  );

  async function search() {
    const term = query.trim();
    if (term.length < 2) return;
    const current = ++token.current;
    setBusy(true);
    setError(null);
    setResults([]);
    setSearched(term);
    // Sites often match the exact text: spellings with/without "the" are tried as well.
    const [anilist, sourceResults] = await Promise.all([
      tolerantSearch(term, searchAniList, (manga) => manga.id).catch(() => null),
      Promise.all(
        sources.map((source) =>
          tolerantSearch(
            term,
            (query) => searchSource(source, query),
            (manga) => manga.id,
          ).catch(() => null),
        ),
      ),
    ]);
    if (current !== token.current) return;
    // One result per manga, whatever the number of sources offering it.
    const hits: SearchHit<InstalledSource>[] = (anilist ?? []).map((manga: AniListManga) => ({
      kind: 'anilist' as const,
      manga,
    }));
    sources.forEach((source, index) => {
      for (const manga of sourceResults[index] ?? []) hits.push({ kind: 'source', manga, source });
    });
    if (!anilist && sourceResults.every((result) => result === null)) {
      setError('Recherche indisponible. Réessaie plus tard.');
    }
    setResults(groupSearchResults(hits));
    setBusy(false);
  }

  function clear() {
    token.current += 1;
    setQuery('');
    setResults([]);
    setSearched(null);
    setError(null);
    setBusy(false);
  }

  async function open(result: SearchResult) {
    setAdding(result.key);
    setError(null);
    try {
      const entry = await openSearchGroup(result);
      router.push({ pathname: '/entry/[id]', params: { id: entry.id } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setAdding(null);
    }
  }

  return { query, setQuery, results: shown, searched, busy, adding, error, search, clear, open };
}
