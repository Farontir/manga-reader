import { describe, expect, it } from 'vitest';

import { pageAtScroll } from './webtoonPosition';

function stack(heights: number[]) {
  let y = 0;
  const layouts = heights.map((height) => {
    const layout = { y, height };
    y += height;
    return layout;
  });
  return { get: (index: number) => layouts[index], total: y };
}

describe('webtoon current page', () => {
  it('follows the strip under the reading line of tall pages', () => {
    const { get, total } = stack([3000, 3000, 3000, 3000]);
    // Line at 2900 + 900 / 3 = 3200: second strip.
    expect(pageAtScroll(4, get, 2900, 900, total)).toBe(1);
    expect(pageAtScroll(4, get, 6100, 900, total)).toBe(2);
  });

  it('starts on the first page at the top', () => {
    const { get, total } = stack([200, 200, 3000]);
    expect(pageAtScroll(3, get, 0, 900, total)).toBe(0);
  });

  it('reaches the last page at the bottom even when it is short', () => {
    const { get, total } = stack([3000, 3000, 300, 250]);
    expect(pageAtScroll(4, get, total - 900, 900, total)).toBe(3);
  });

  it('handles short pages several to a screen', () => {
    const { get, total } = stack([566, 566, 566, 566, 566, 566]);
    // Line at 700 + 300 = 1000: second page (566-1132).
    expect(pageAtScroll(6, get, 700, 900, total)).toBe(1);
  });

  it('gives up while layouts are unknown', () => {
    expect(pageAtScroll(3, () => undefined, 500, 900, 5000)).toBeNull();
    expect(pageAtScroll(0, () => undefined, 0, 900, 0)).toBeNull();
  });
});
