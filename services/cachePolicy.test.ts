import { describe, expect, it } from 'vitest';

import { leastRecentlyUsedKeys } from './cachePolicy';

describe('reader cache eviction', () => {
  it('evicts oldest images until the byte budget is met', () => {
    expect(
      leastRecentlyUsedKeys(
        {
          oldest: { size: 6, lastUsed: 1 },
          middle: { size: 5, lastUsed: 2 },
          newest: { size: 4, lastUsed: 3 },
        },
        9,
      ),
    ).toEqual(['oldest']);
  });

  it('keeps a page in use while pruning other images', () => {
    expect(
      leastRecentlyUsedKeys(
        {
          visible: { size: 6, lastUsed: 1 },
          old: { size: 5, lastUsed: 2 },
          next: { size: 4, lastUsed: 3 },
        },
        9,
        new Set(['visible']),
      ),
    ).toEqual(['old', 'next']);
  });
});
