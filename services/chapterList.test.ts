import { describe, expect, it } from 'vitest';

import { chapterLabel, mergeChapters, nextChapter } from './chapterList';

describe('chapter list', () => {
  const merged = mergeChapters(
    [{ chapterNumber: 1, title: 'Tome 1 · Chapitre 1' }],
    [
      { number: 1, title: 'Romance Dawn', sourceId: 'a', chapterId: 'a-1' },
      { number: 2, title: null, sourceId: 'a', chapterId: 'a-2' },
      { number: 2, title: 'From B', sourceId: 'b', chapterId: 'b-2' },
      { number: 2.5, title: 'Extra', sourceId: 'a', chapterId: 'a-2.5' },
    ],
    [
      { sourceId: 'a', priority: 0 },
      { sourceId: 'b', priority: 5 },
    ],
  );

  it('keeps local files first and the preferred source for each number', () => {
    expect(merged.map((item) => [item.number, item.local, item.chapterId])).toEqual([
      [2.5, false, 'a-2.5'],
      [2, false, 'b-2'],
      [1, true, undefined],
    ]);
  });

  it('finds the following chapter, half chapters included', () => {
    expect(nextChapter(merged, 1)?.number).toBe(2);
    expect(nextChapter(merged, 2)?.number).toBe(2.5);
    expect(nextChapter(merged, 2.5)).toBeNull();
  });

  it('labels local chapters by title and source chapters by number', () => {
    expect(merged.map(chapterLabel)).toEqual(['Chapitre 2.5', 'Chapitre 2', 'Tome 1 · Chapitre 1']);
  });
});
