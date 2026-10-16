import { describe, expect, it } from 'vitest';

import { queryVariants, titlesMatch } from './matching';

describe('cross source matching', () => {
  it('accepts equivalent localized titles', () => {
    expect(titlesMatch('L’Attaque des Titans', ['Shingeki no Kyojin'], 'Shingeki-no Kyojin')).toBe(
      true,
    );
  });

  it('does not bind unrelated editions', () => {
    expect(titlesMatch('One Piece', [], 'One Piece Party')).toBe(false);
  });

  it('ignores a leading article', () => {
    expect(titlesMatch('The Beginning After the End', [], 'Beginning After the End')).toBe(true);
    expect(titlesMatch('La Cité', [], 'Cité')).toBe(true);
  });

  it('offers other spellings of a query', () => {
    expect(queryVariants('beginning after the end')).toEqual(['the beginning after the end']);
    expect(queryVariants('The Beginning After the End')).toEqual(['Beginning After the End']);
    expect(queryVariants('Re:Zero')).toEqual(['the Re Zero', 'Re Zero']);
    expect(queryVariants('l’attaque des titans')).toEqual([
      'attaque des titans',
      'l attaque des titans',
    ]);
  });
});
