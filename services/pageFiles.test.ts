import { describe, expect, it } from 'vitest';

import { isImagePath, sortPagePaths } from './pageFiles';

describe('page files', () => {
  it('keeps a human chapter order', () => {
    expect(sortPagePaths(['page10.jpg', 'page2.jpg', 'page1.jpg'])).toEqual([
      'page1.jpg',
      'page2.jpg',
      'page10.jpg',
    ]);
  });

  it('ignores metadata and unsupported files', () => {
    expect(isImagePath('__MACOSX/page.jpg')).toBe(false);
    expect(isImagePath('.hidden/page.jpg')).toBe(false);
    expect(isImagePath('chapter/001.webp')).toBe(true);
    expect(isImagePath('chapter/info.txt')).toBe(false);
  });
});
