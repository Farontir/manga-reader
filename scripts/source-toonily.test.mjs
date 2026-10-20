import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

it('extracts Toonily catalog, chapter and CDN pages without stopping at a bad image URL', async () => {
  const bundle = await readFile(
    new URL('../source-repo/toonily/bundle.js', import.meta.url),
    'utf8',
  );
  const listing = `<a href="https://toonily.com/genre/mature/">Mature <span class="count">(10)</span></a>
    <div class="page-item-detail manga">
      <div class="item-thumb"><img srcset="https://static.tnlycdn.com/sample-175x238.jpg 175w, https://static.tnlycdn.com/sample-350x476.jpg 350w"></div>
      <div class="post-title"><a href="https://toonily.com/serie/sample-a1b2c3d4/">Sample</a></div>
    </div><a href="https://toonily.com/webtoons/page/2/">2</a>`;
  const details = `<div class="post-title"><h1>Sample <span>TOP</span></h1></div>
    <div class="summary_image"><img src="https://static.tnlycdn.com/sample.jpg"></div>
    <div class="genres-content"><a rel="tag">Drama</a></div>
    <div class="listing-chapters_wrap"><li class="wp-manga-chapter">
      <a href="https://toonily.com/serie/sample-a1b2c3d4/chapter-2/">Chapter 2</a>
      <span class="chapter-release-date">Oct 13, 26</span>
    </li><li class="wp-manga-chapter">
      <a href="https://toonily.com/serie/sample-a1b2c3d4/side-story-1/">Side Story 1</a>
    </li></div>`;
  const reader = `<div class="reading-content">
    <img class="wp-manga-chapter-img" src="https://data.tnlycdn.com/chapters/sample/01.jpg">
    <img class="wp-manga-chapter-img" src="https://other.example/02.jpg">
    <img class="wp-manga-chapter-img" src="https://data.tnlycdn.com/chapters/sample/03.webp">
  </div>`;
  const requests = [];
  const sandbox = {
    URL,
    app: {
      fetch: async (url) => {
        requests.push(url);
        const path = new URL(url).pathname;
        return {
          status: 200,
          body:
            path.includes('/chapter-') || path.includes('/side-story-')
              ? reader
              : path.startsWith('/serie/')
                ? details
                : listing,
        };
      },
    },
  };
  runInNewContext(bundle, sandbox);
  const source = sandbox.source;
  const discovery = await source.discover();
  expect(discovery.sections.map((section) => section.more)).toEqual([
    'latest',
    'views',
    'new-manga',
  ]);
  expect(discovery.genres.find((genre) => genre.title === 'Mature')?.id).toBe('genre:mature');
  const catalog = await source.catalog(1, 'latest');
  expect(catalog.hasMore).toBe(true);
  expect(catalog.items[0].coverUrl).toBe('https://static.tnlycdn.com/sample-350x476.jpg');
  expect((await source.search('Sample'))[0].id).toBe('/serie/sample-a1b2c3d4/');
  expect((await source.manga('/serie/sample-a1b2c3d4/')).title).toBe('Sample');
  const chapters = await source.chapters('/serie/sample-a1b2c3d4/');
  expect(chapters[0].number).toBe(2);
  expect(chapters[1].number).toBe(2.001);
  const pages = await source.pages(chapters[0].id);
  expect(pages.map((page) => page.url)).toEqual([
    'https://data.tnlycdn.com/chapters/sample/01.jpg',
    'https://data.tnlycdn.com/chapters/sample/03.webp',
  ]);
  expect(pages.every((page) => page.headers.Referer === 'https://toonily.com/')).toBe(true);
  expect((await source.pages(chapters[1].id)).length).toBe(2);
  expect(requests.every((url) => new URL(url).hostname === 'toonily.com')).toBe(true);
});
