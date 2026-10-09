import { describe, expect, it } from 'vitest';

import { pickTitles } from './anilist';
import { englishFirst } from './titles';

describe('English titles', () => {
  it('prefers the English AniList title over romaji', () => {
    expect(
      pickTitles({
        english: 'Solo Leveling',
        romaji: 'Na Honjaman Level Up',
        native: '나 혼자만 레벨업',
      }),
    ).toEqual(['Solo Leveling', 'Na Honjaman Level Up', '나 혼자만 레벨업']);
    expect(pickTitles({ english: null, romaji: 'Berserk', native: 'Berserk' })).toEqual([
      'Berserk',
    ]);
  });

  it('renames an entry to its English title and keeps the others as alternatives', () => {
    expect(
      englishFirst(
        {
          canonicalTitle: 'Na Honjaman Level Up',
          altTitles: ['Solo Leveling', '나 혼자만 레벨업'],
        },
        ['Solo Leveling', 'Na Honjaman Level Up', '나 혼자만 레벨업'],
      ),
    ).toEqual({
      canonicalTitle: 'Solo Leveling',
      altTitles: ['Na Honjaman Level Up', '나 혼자만 레벨업'],
    });
  });

  it('leaves entries already titled in English, or without AniList titles', () => {
    expect(
      englishFirst({ canonicalTitle: 'Solo Leveling', altTitles: [] }, ['Solo Leveling']),
    ).toBeNull();
    expect(englishFirst({ canonicalTitle: 'Local', altTitles: [] }, [])).toBeNull();
  });
});
