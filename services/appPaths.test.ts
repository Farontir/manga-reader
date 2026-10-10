import { describe, expect, it } from 'vitest';

import { rebaseDocumentUri } from './appPaths';

const current = 'file:///var/mobile/Containers/Data/Application/NEW-UUID/Documents/';

describe('saved file URIs', () => {
  it('moves files from a previous app container to the current one', () => {
    expect(
      rebaseDocumentUri(
        'file:///var/mobile/Containers/Data/Application/OLD-UUID/Documents/sources/org.mangadex.en/bundle.js',
        current,
      ),
    ).toBe(`${current}sources/org.mangadex.en/bundle.js`);
    expect(
      rebaseDocumentUri(
        'file:///var/mobile/Containers/Data/Application/OLD-UUID/Documents/downloads/e1/12/00003.jpg',
        current,
      ),
    ).toBe(`${current}downloads/e1/12/00003.jpg`);
  });

  it('handles the Expo Go document folder', () => {
    const expoGo =
      'file:///var/mobile/Containers/Data/Application/NEW/Documents/ExponentExperienceData/%40farontir%2Fmanga-reader/';
    expect(
      rebaseDocumentUri(
        'file:///var/mobile/Containers/Data/Application/OLD/Documents/ExponentExperienceData/%40farontir%2Fmanga-reader/local/abc/00001.png',
        expoGo,
      ),
    ).toBe(`${expoGo}local/abc/00001.png`);
  });

  it('leaves current, remote and unrelated URIs alone', () => {
    expect(rebaseDocumentUri(`${current}local/a/1.jpg`, current)).toBe(`${current}local/a/1.jpg`);
    expect(rebaseDocumentUri('https://uploads.mangadex.org/c.jpg', current)).toBe(
      'https://uploads.mangadex.org/c.jpg',
    );
    expect(rebaseDocumentUri('file:///private/var/tmp/picked.cbz', current)).toBe(
      'file:///private/var/tmp/picked.cbz',
    );
  });
});
