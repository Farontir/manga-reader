import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createProgressSaver } from './progressSaver';
import {
  buildFeed,
  feedIndexOf,
  feedPosition,
  shouldLoadNext,
  type FeedSegment,
} from './readerFeed';

const segment = (number: number, count: number): FeedSegment => ({
  number,
  title: `Chapitre ${number}`,
  pages: Array.from({ length: count }, (_, page) => ({ uri: `c${number}-${page}.jpg` })),
});

describe('reader feed', () => {
  const segments = [segment(1, 3), segment(2, 2)];
  const items = buildFeed(segments);

  it('lists each chapter followed by its transition', () => {
    expect(
      items.map((item) =>
        item.kind === 'page' ? item.key.split(':').slice(0, 2).join(':') : item.key,
      ),
    ).toEqual(['1:0', '1:1', '1:2', 'end:1', '2:0', '2:1', 'end:2']);
  });

  it('maps a transition to the last page of the chapter it closes', () => {
    expect(feedPosition(items, 3)).toEqual({ segment: 0, page: 2 });
    expect(feedPosition(items, 4)).toEqual({ segment: 1, page: 0 });
    expect(feedPosition(items, 99)).toBeNull();
  });

  it('finds the feed index of a saved page', () => {
    expect(feedIndexOf(items, 1, 1)).toBe(5);
    expect(feedIndexOf(items, 5, 0)).toBe(0);
  });

  it('asks for the next chapter near the end of the last loaded one only', () => {
    const long = [segment(1, 20), segment(2, 20)];
    expect(shouldLoadNext(long, { segment: 1, page: 15 })).toBe(false);
    expect(shouldLoadNext(long, { segment: 1, page: 16 })).toBe(true);
    expect(shouldLoadNext(long, { segment: 0, page: 19 })).toBe(false);
  });
});

describe('progress saver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('writes only the settled position', () => {
    const save = vi.fn(() => Promise.resolve());
    const saver = createProgressSaver(save, 400);
    saver.record(1, 0, 10);
    saver.record(1, 1, 10);
    saver.record(1, 2, 10);
    vi.advanceTimersByTime(399);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledExactlyOnceWith(1, 2, 10, false);
  });

  it('writes the previous chapter at once when the chapter changes', () => {
    const save = vi.fn(() => Promise.resolve());
    const saver = createProgressSaver(save, 400);
    saver.record(1, 9, 10);
    saver.record(2, 0, 8);
    expect(save).toHaveBeenCalledExactlyOnceWith(1, 9, 10, true);
    saver.flush();
    expect(save).toHaveBeenLastCalledWith(2, 0, 8, false);
  });
});
