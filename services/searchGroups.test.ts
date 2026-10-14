import { describe, expect, it } from 'vitest';

import type { AniListManga } from './anilist';
import { groupSearchResults, type SearchHit } from './searchGroups';

const mangadex = { id: 'org.mangadex.en' };
const komga = { id: 'org.komga.demo' };
const anilist = (id: number, title: string, altTitles: string[] = []): AniListManga => ({
  id,
  title,
  altTitles,
  coverUrl: `https://anilist/${id}.jpg`,
  description: null,
  status: null,
});

describe('search result groups', () => {
  it('shows a manga once, with every source offering it', () => {
    const hits: SearchHit<{ id: string }>[] = [
      { kind: 'anilist', manga: anilist(105398, 'Solo Leveling', ['Na Honjaman Level Up']) },
      {
        kind: 'source',
        source: mangadex,
        manga: { id: 'md-1', title: 'Solo Leveling', anilistId: 105398 },
      },
      { kind: 'source', source: komga, manga: { id: 'k-1', title: 'Na Honjaman Level Up' } },
      { kind: 'source', source: mangadex, manga: { id: 'md-2', title: 'Solo Leveling: Ragnarok' } },
    ];
    const groups = groupSearchResults(hits);
    expect(groups.map((group) => [group.title, group.sources.map((s) => s.manga.id)])).toEqual([
      ['Solo Leveling', ['md-1', 'k-1']],
      ['Solo Leveling: Ragnarok', ['md-2']],
    ]);
    expect(groups[0]?.anilist?.id).toBe(105398);
    expect(groups[0]?.coverUrl).toBe('https://anilist/105398.jpg');
  });

  it('prefers AniList identity and keeps different AniList ids apart', () => {
    const groups = groupSearchResults([
      { kind: 'source', source: mangadex, manga: { id: 'a', title: 'Berserk', anilistId: 1 } },
      { kind: 'anilist', manga: anilist(1, 'Berserk') },
      { kind: 'anilist', manga: anilist(2, 'Berserk') },
    ]);
    expect(groups.map((group) => [group.title, group.anilist?.id, group.sources.length])).toEqual([
      ['Berserk', 1, 1],
      ['Berserk', 2, 0],
    ]);
  });

  it('never merges two manga of the same source', () => {
    const groups = groupSearchResults([
      { kind: 'source', source: mangadex, manga: { id: 'a', title: 'Monster' } },
      { kind: 'source', source: mangadex, manga: { id: 'b', title: 'Monster' } },
    ]);
    expect(groups).toHaveLength(2);
  });
});
