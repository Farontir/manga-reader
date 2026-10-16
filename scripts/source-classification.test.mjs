import { describe, expect, it } from 'vitest';

import { category, ratingFromGenres } from './source-classification.js';

describe('source-side classification', () => {
  it('marks explicit adult labels, including accented names', () => {
    expect(ratingFromGenres(['Romance', 'Adult'])).toBe('erotica');
    expect(ratingFromGenres(['Érotique'])).toBe('erotica');
    expect(ratingFromGenres(['Adult', 'Hentai'])).toBe('pornographic');
    expect(category('genre:adult', 'Adult').sensitive).toBe(true);
  });

  it('does not treat Mature or Ecchi alone as erotica', () => {
    expect(ratingFromGenres(['Mature', 'Ecchi'])).toBeUndefined();
    expect(category('genre:mature', 'Mature')).toEqual({ id: 'genre:mature', title: 'Mature' });
  });
});
