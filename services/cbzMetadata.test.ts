import { describe, expect, it } from 'vitest';

import { parseComicInfo, resolveCbzMetadata } from './cbzMetadata';

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
});
