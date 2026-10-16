import { describe, expect, it } from 'vitest';

import { formatDuration, rankFor, readingStreak, topGenres, totalXp } from './profile';

describe('profile', () => {
  it('earns XP for chapters and completed manga', () => {
    expect(totalXp(0, 0)).toBe(0);
    expect(totalXp(12, 1)).toBe(170);
  });

  it('turns XP into a rank with its progress', () => {
    expect(rankFor(0)).toEqual({
      rank: 'Novice',
      level: 1,
      next: 'Apprenti',
      remaining: 100,
      progress: 0,
    });
    expect(rankFor(170)).toMatchObject({
      rank: 'Apprenti',
      level: 2,
      next: 'Lecteur',
      remaining: 130,
    });
    expect(rankFor(170).progress).toBeCloseTo(0.35);
    expect(rankFor(25_000)).toEqual({
      rank: 'Légende',
      level: 10,
      next: null,
      remaining: 0,
      progress: 1,
    });
  });

  it('counts consecutive reading days up to today or yesterday', () => {
    const days = ['2026-10-16', '2026-10-15', '2026-10-14', '2026-10-11'];
    expect(readingStreak(days, '2026-10-16')).toBe(3);
    expect(readingStreak(days, '2026-10-17')).toBe(3);
    expect(readingStreak(days, '2026-10-18')).toBe(0);
    expect(readingStreak(['2026-10-01', '2026-09-30'], '2026-10-01')).toBe(2);
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45 * 60 + 30)).toBe('45 min');
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe('3 h 05 min');
  });

  it('ranks genres by chapters read', () => {
    expect(
      topGenres([
        { genres: ['Action', 'Fantasy'], chaptersRead: 10 },
        { genres: ['Romance', 'Fantasy'], chaptersRead: 4 },
        { genres: ['Horror'], chaptersRead: 0 },
      ]),
    ).toEqual([
      { genre: 'Fantasy', chapters: 14 },
      { genre: 'Action', chapters: 10 },
      { genre: 'Romance', chapters: 4 },
    ]);
  });
});
