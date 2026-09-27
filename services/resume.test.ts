import { describe, expect, it } from 'vitest';

import { resumeTarget } from './resume';

const read = (chapterNumber: number, readAt: string, completed: boolean, pageIndex = 0) => ({
  chapterNumber,
  pageIndex,
  readAt,
  completed,
});

describe('resume target', () => {
  it('starts at the first chapter when nothing was read', () => {
    expect(resumeTarget([12, 3, 7], [])).toEqual({ kind: 'start', chapterNumber: 3 });
  });

  it('resumes the most recently opened unfinished chapter at its page', () => {
    expect(
      resumeTarget(
        [1, 2, 3, 4],
        [read(1, '2026-09-01T10:00:00Z', true), read(3, '2026-09-20T10:00:00Z', false, 14)],
      ),
    ).toEqual({ kind: 'resume', chapterNumber: 3, pageIndex: 14 });
  });

  it('moves to the next known chapter, skipping gaps and half chapters', () => {
    expect(resumeTarget([1, 2, 2.5, 5], [read(2, '2026-09-20T10:00:00Z', true)])).toEqual({
      kind: 'next',
      chapterNumber: 2.5,
    });
  });

  it('follows the latest reading, not the highest chapter', () => {
    expect(
      resumeTarget(
        [1, 2, 3, 10],
        [read(10, '2026-09-01T10:00:00Z', true), read(2, '2026-09-25T10:00:00Z', true)],
      ),
    ).toEqual({ kind: 'next', chapterNumber: 3 });
  });

  it('reports being up to date after the last chapter', () => {
    expect(resumeTarget([1, 2], [read(2, '2026-09-20T10:00:00Z', true)])).toEqual({
      kind: 'upToDate',
      chapterNumber: 2,
    });
  });

  it('has no target without chapters', () => {
    expect(resumeTarget([], [])).toBeNull();
  });
});
