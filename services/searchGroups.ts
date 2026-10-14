import type { SourceManga } from '../sources/types';
import type { AniListManga } from './anilist';
import { titlesMatch } from './matching';

export type SearchHit<S> =
  { kind: 'anilist'; manga: AniListManga } | { kind: 'source'; manga: SourceManga; source: S };

/** One manga found by the search, with every source that offers it. */
export type SearchGroup<S> = {
  key: string;
  title: string;
  coverUrl: string | null;
  anilist: AniListManga | null;
  sources: { source: S; manga: SourceManga }[];
};

function titlesOf(hit: SearchHit<unknown>): { title: string; altTitles: string[] } {
  return { title: hit.manga.title, altTitles: hit.manga.altTitles ?? [] };
}

function anilistIdOf(hit: SearchHit<unknown>): number | undefined {
  return hit.kind === 'anilist' ? hit.manga.id : hit.manga.anilistId;
}

/**
 * Merges search hits that are the same manga (same AniList id, or a shared title among
 * their titles), so each manga appears once whatever the number of sources offering it.
 * Two different manga of one source are never merged. Order of first appearance is kept.
 */
export function groupSearchResults<S extends { id: string }>(
  hits: SearchHit<S>[],
): SearchGroup<S>[] {
  const groups: (SearchGroup<S> & {
    anilistId?: number;
    titles: { title: string; altTitles: string[] }[];
  })[] = [];
  for (const hit of hits) {
    const anilistId = anilistIdOf(hit);
    const titles = titlesOf(hit);
    const group = groups.find((candidate) => {
      if (hit.kind === 'anilist' && candidate.anilist) return false;
      if (
        hit.kind === 'source' &&
        candidate.sources.some((entry) => entry.source.id === hit.source.id)
      ) {
        return false;
      }
      if (anilistId !== undefined && candidate.anilistId !== undefined) {
        return anilistId === candidate.anilistId;
      }
      return candidate.titles.some((known) =>
        titlesMatch(known.title, known.altTitles, titles.title, titles.altTitles),
      );
    });
    if (!group) {
      groups.push({
        key:
          hit.kind === 'anilist' ? `anilist:${hit.manga.id}` : `${hit.source.id}:${hit.manga.id}`,
        title: hit.manga.title,
        coverUrl: hit.manga.coverUrl ?? null,
        anilist: hit.kind === 'anilist' ? hit.manga : null,
        sources: hit.kind === 'source' ? [{ source: hit.source, manga: hit.manga }] : [],
        anilistId,
        titles: [titles],
      });
      continue;
    }
    group.titles.push(titles);
    group.anilistId ??= anilistId;
    if (hit.kind === 'anilist') {
      // AniList gives the stable identity, display title and cover.
      group.anilist = hit.manga;
      group.title = hit.manga.title;
      group.coverUrl = hit.manga.coverUrl ?? group.coverUrl;
    } else {
      group.sources.push({ source: hit.source, manga: hit.manga });
      group.coverUrl ??= hit.manga.coverUrl ?? null;
    }
  }
  return groups.map(({ key, title, coverUrl, anilist, sources }) => ({
    key,
    title,
    coverUrl,
    anilist,
    sources,
  }));
}
