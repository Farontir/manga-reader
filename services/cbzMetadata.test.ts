import { describe, expect, it } from 'vitest';

import { parseArchiveName, parseComicInfo, resolveCbzMetadata } from './cbzMetadata';

describe('CBZ metadata', () => {
  it('uses ComicInfo series, chapter, volume and title', () => {
    const info = parseComicInfo(`<?xml version="1.0"?>
      <ComicInfo><Series>Bloom &amp; Blue</Series><Volume>4</Volume>
      <Number>12.5</Number><Title><![CDATA[Un été]]></Title></ComicInfo>`);
    expect(resolveCbzMetadata('Wrong Name - Ch 99.cbz', info)).toEqual({
      series: 'Bloom & Blue',
      chapterNumber: 12.5,
      chapterTitle: 'Tome 4 · Chapitre 12.5 · Un été',
    });
  });

  it('uses volume as the reading key for a volume-only archive', () => {
    expect(
      resolveCbzMetadata(
        'Archive.cbz',
        parseComicInfo('<ComicInfo><Series>Bloom</Series><Volume>4</Volume></ComicInfo>'),
      ),
    ).toEqual({
      series: 'Bloom',
      chapterNumber: 4,
      chapterTitle: 'Tome 4',
    });
  });

  it('falls back to the archive filename when fields are absent', () => {
    expect(resolveCbzMetadata('Bloom - Tome 04 - Chapitre 12.cbz')).toEqual({
      series: 'Bloom',
      chapterNumber: 12,
      chapterTitle: 'Tome 4 · Chapitre 12',
    });
  });

  it.each([
    ['One Piece T01.cbz', { series: 'One Piece', volume: 1 }],
    ['Naruto - T.05.cbz', { series: 'Naruto', volume: 5 }],
    ['Berserk_Vol.12.cbz', { series: 'Berserk', volume: 12 }],
    ['Chainsaw Man Ch.150.cbz', { series: 'Chainsaw Man', chapter: 150 }],
    ['One Piece v01 c001.cbz', { series: 'One Piece', chapter: 1, volume: 1 }],
    [
      '[Scan-Team] One Piece - c1087 (v105).cbz',
      { series: 'One Piece', chapter: 1087, volume: 105 },
    ],
    ['One Piece 1087.cbz', { series: 'One Piece', chapter: 1087 }],
    ['Blame! - 01.cbz', { series: 'Blame!', chapter: 1 }],
    ['Tokyo Ghoul [Digital].cbz', { series: 'Tokyo Ghoul' }],
    ['Kaiju No. 8 T02.cbz', { series: 'Kaiju No. 8', volume: 2 }],
  ])('parses %s', (filename, expected) => {
    expect(parseArchiveName(filename)).toEqual(expected);
  });

  it('names the series after the folder when the filename has none', () => {
    expect(resolveCbzMetadata('Vol.3 Ch.25.cbz', undefined, 'Dragon Ball')).toEqual({
      series: 'Dragon Ball',
      chapterNumber: 25,
      chapterTitle: 'Tome 3 · Chapitre 25',
    });
  });
});
