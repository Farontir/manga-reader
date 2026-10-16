import { describe, expect, it } from 'vitest';

import { createReadingTimer } from './readingTimer';

describe('reading timer', () => {
  const minute = 60 * 1000;

  function record() {
    const saved: [number, string, number][] = [];
    const timer = createReadingTimer((chapter, startedAt, seconds) => {
      saved.push([chapter, startedAt, seconds]);
    });
    return { saved, timer };
  }

  it('counts the time between page turns, per chapter', () => {
    const { saved, timer } = record();
    timer.activity(1, 0);
    timer.activity(1, 30_000);
    timer.activity(1, 75_000);
    timer.activity(2, 90_000);
    timer.activity(2, 100_000);
    timer.flush();
    expect(saved).toEqual([
      [1, new Date(0).toISOString(), 75],
      [2, new Date(90_000).toISOString(), 10],
    ]);
  });

  it('ignores long pauses on one page and time in the background', () => {
    const { saved, timer } = record();
    timer.activity(3, 0);
    timer.activity(3, 20_000);
    timer.activity(3, 20_000 + 10 * minute);
    timer.activity(3, 20_000 + 10 * minute + 5_000);
    timer.pause();
    timer.activity(3, 60 * minute);
    timer.activity(3, 60 * minute + 40_000);
    timer.flush();
    expect(saved.map(([chapter, , seconds]) => [chapter, seconds])).toEqual([
      [3, 25],
      [3, 40],
    ]);
  });

  it('saves nothing for a chapter only glanced at', () => {
    const { saved, timer } = record();
    timer.activity(4, 0);
    timer.flush();
    expect(saved).toEqual([]);
  });
});
