import { describe, expect, it } from 'vitest';

import { dayLabel, groupByDay } from './historyGroups';

describe('history days', () => {
  const now = new Date(2026, 9, 16, 15, 0);

  it('labels today, yesterday, then dates', () => {
    expect(dayLabel(new Date(2026, 9, 16, 0, 5), now)).toBe('Aujourd’hui');
    expect(dayLabel(new Date(2026, 9, 15, 23, 59), now)).toBe('Hier');
    expect(dayLabel(new Date(2026, 9, 15, 0, 1), now)).toBe('Hier');
    expect(dayLabel(new Date(2026, 9, 12, 10), now)).toBe('12 octobre');
    expect(dayLabel(new Date(2025, 7, 1, 10), now)).toBe('1 août 2025');
  });

  it('groups consecutive items of the same day', () => {
    const at = (day: number, hour: number) => ({
      readAt: new Date(2026, 9, day, hour).toISOString(),
    });
    expect(
      groupByDay([at(16, 14), at(16, 9), at(15, 20), at(12, 8)], now).map((section) => [
        section.title,
        section.data.length,
      ]),
    ).toEqual([
      ['Aujourd’hui', 2],
      ['Hier', 1],
      ['12 octobre', 1],
    ]);
  });
});
