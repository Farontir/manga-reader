import { describe, expect, it } from 'vitest';

import { coverImageSource } from './coverImage';

describe('cover image source', () => {
  it('adds the MangaBats referer to its CDN images', () => {
    expect(coverImageSource('https://img-r2.2xstorage.com/thumb/one-piece.webp')).toEqual({
      uri: 'https://img-r2.2xstorage.com/thumb/one-piece.webp',
      headers: { Referer: 'https://www.mangabats.com/' },
    });
  });

  it('keeps other covers unchanged', () => {
    expect(coverImageSource('https://example.com/cover.jpg')).toEqual({
      uri: 'https://example.com/cover.jpg',
    });
  });

  it('adds a referer to Waitst covers used by MangaKakalot', () => {
    expect(coverImageSource('https://storage4.waitst.com/thumb/sample.webp')).toEqual({
      uri: 'https://storage4.waitst.com/thumb/sample.webp',
      headers: { Referer: 'https://www.mangabats.com/' },
    });
  });

  it('uses the source site as referer for protected image hosts', () => {
    expect(coverImageSource('https://webtoon-phinf.pstatic.net/sample.jpg')).toEqual({
      uri: 'https://webtoon-phinf.pstatic.net/sample.jpg',
      headers: { Referer: 'https://www.webtoons.com/' },
    });
    expect(coverImageSource('https://fmcdn.mfcdn.net/cover.jpg')).toEqual({
      uri: 'https://fmcdn.mfcdn.net/cover.jpg',
      headers: { Referer: 'https://m.fanfox.net/' },
    });
    expect(coverImageSource('https://sushiscan.net/cover.jpg')).toEqual({
      uri: 'https://sushiscan.net/cover.jpg',
      headers: { Referer: 'https://sushiscan.net/' },
    });
  });
});
