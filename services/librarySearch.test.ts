import { describe, expect, it } from 'vitest';

import { filterLibrary, unreadFirst } from './librarySearch';

const entries = [
  { id: 'a', canonicalTitle: 'The Beginning After the End', altTitles: ['TBATE'] },
  { id: 'b', canonicalTitle: 'Solo Leveling', altTitles: ['Na Honjaman Level Up'] },
  { id: 'c', canonicalTitle: 'Pokémon Adventures', altTitles: [] },
];

describe('library search', () => {
  it('matches every word, in any title, without accents or case', () => {
    expect(filterLibrary(entries, 'beginning end').map((entry) => entry.id)).toEqual(['a']);
    expect(filterLibrary(entries, 'tbate').map((entry) => entry.id)).toEqual(['a']);
    expect(filterLibrary(entries, 'honjaman').map((entry) => entry.id)).toEqual(['b']);
    expect(filterLibrary(entries, 'POKEMON').map((entry) => entry.id)).toEqual(['c']);
    expect(filterLibrary(entries, '  ')).toHaveLength(3);
    expect(filterLibrary(entries, 'one piece')).toEqual([]);
  });

  it('puts manga with unread chapters first, most unread first', () => {
    expect(unreadFirst(entries, { c: 2, b: 5 }).map((entry) => entry.id)).toEqual(['b', 'c', 'a']);
    expect(unreadFirst(entries, {}).map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });
});
