import { describe, expect, it } from 'vitest';

import { isSensitive, sourceMangaRating, strictestRating } from './sensitive';

describe('sensitive content', () => {
  it('follows the user override first, then the rating and AniList', () => {
    const entry = (
      contentRating: string | null,
      anilistAdult: boolean | null,
      sensitiveOverride: boolean | null,
    ) => isSensitive({ contentRating, anilistAdult, sensitiveOverride });
    // Automatic.
    expect(entry(null, null, null)).toBe(false);
    expect(entry('safe', false, null)).toBe(false);
    expect(entry('suggestive', null, null)).toBe(false);
    expect(entry('erotica', null, null)).toBe(true);
    expect(entry('pornographic', false, null)).toBe(true);
    expect(entry(null, true, null)).toBe(true);
    expect(entry('safe', true, null)).toBe(true);
    // The user's choice wins both ways.
    expect(entry('pornographic', true, false)).toBe(false);
    expect(entry('safe', false, true)).toBe(true);
    expect(entry(null, null, true)).toBe(true);
  });

  it('keeps the strictest rating seen', () => {
    expect(strictestRating('safe', 'erotica')).toBe('erotica');
    expect(strictestRating('pornographic', 'suggestive')).toBe('pornographic');
    expect(strictestRating(null, 'safe')).toBe('safe');
    expect(strictestRating('unknown', undefined)).toBeNull();
  });

  it('rates source titles from their rating, else their genres', () => {
    expect(sourceMangaRating({ contentRating: 'safe', genres: ['Adult'] })).toBe('safe');
    expect(sourceMangaRating({ genres: ['Action', 'Smut'] })).toBe('erotica');
    expect(sourceMangaRating({ genres: ['Érotique'] })).toBe('erotica');
    expect(sourceMangaRating({ genres: ['hentai'] })).toBe('erotica');
    expect(sourceMangaRating({ genres: ['Ecchi', 'Mature', 'Adulthood'] })).toBeNull();
    expect(sourceMangaRating({})).toBeNull();
  });
});
