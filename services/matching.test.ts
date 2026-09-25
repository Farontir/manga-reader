import { describe, expect, it } from 'vitest';

import { titlesMatch } from './matching';

describe('cross source matching', () => {
  it('accepts equivalent localized titles', () => {
    expect(titlesMatch('L’Attaque des Titans', ['Shingeki no Kyojin'], 'Shingeki-no Kyojin')).toBe(
      true,
    );
  });

  it('does not bind unrelated editions', () => {
    expect(titlesMatch('One Piece', [], 'One Piece Party')).toBe(false);
  });
});
