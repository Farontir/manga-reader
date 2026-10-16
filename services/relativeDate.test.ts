import { describe, expect, it } from 'vitest';

import { relativeDate } from './relativeDate';

describe('relative dates', () => {
  const now = new Date(2026, 9, 16, 15, 0);
  const daysAgo = (days: number, hour = 12) => new Date(2026, 9, 16 - days, hour).toISOString();

  it('says today and yesterday by calendar day', () => {
    expect(relativeDate(daysAgo(0, 1), now)).toBe('aujourd’hui');
    expect(relativeDate(daysAgo(1, 23), now)).toBe('hier');
    expect(relativeDate(daysAgo(1, 0), now)).toBe('hier');
  });

  it('counts days, weeks, months and years', () => {
    expect(relativeDate(daysAgo(2), now)).toBe('il y a 2 jours');
    expect(relativeDate(daysAgo(6), now)).toBe('il y a 6 jours');
    expect(relativeDate(daysAgo(7), now)).toBe('il y a 1 semaine');
    expect(relativeDate(daysAgo(20), now)).toBe('il y a 2 semaines');
    expect(relativeDate(daysAgo(45), now)).toBe('il y a 1 mois');
    expect(relativeDate(daysAgo(200), now)).toBe('il y a 6 mois');
    expect(relativeDate(daysAgo(400), now)).toBe('il y a 1 an');
    expect(relativeDate(daysAgo(800), now)).toBe('il y a 2 ans');
  });

  it('gives nothing for missing or invalid dates', () => {
    expect(relativeDate(null, now)).toBeNull();
    expect(relativeDate('pas une date', now)).toBeNull();
  });
});
