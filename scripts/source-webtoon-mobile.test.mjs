import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

for (const locale of ['en', 'fr']) {
  it(`reads public WEBTOON ${locale} content from the iPhone site`, async () => {
    const bundle = await readFile(
      new URL(`../source-repo/webtoon-${locale}/bundle.js`, import.meta.url),
      'utf8',
    );
    const series = `/${locale}/romance/sample-story/list?title_no=123`;
    const chapter = `/${locale}/romance/sample-story/episode-1/viewer?title_no=123&episode_no=1`;
    const cover = 'https://webtoon-phinf.pstatic.net/cover.jpg';
    const image = 'https://webtoon-phinf.pstatic.net/page.jpg';
    const calls = [];
    const sandbox = {
      URL,
      URLSearchParams,
      app: {
        fetch: async (url) => {
          calls.push(url);
          expect(['www.webtoons.com', 'm.webtoons.com']).toContain(new URL(url).hostname);
          if (url.includes('/search/originals?')) return { status: 404, body: '' };
          if (url.includes('/search/result?'))
            return {
              status: 200,
              body: JSON.stringify({
                success: true,
                result: {
                  webtoonResult: {
                    titleList: [
                      {
                        titleNo: 123,
                        title: 'Sample Story',
                        titleGroupName: 'sample-story',
                        representGenre: 'ROMANCE',
                        thumbnailMobile: '/cover.jpg',
                        unsuitableForChildren: false,
                      },
                    ],
                  },
                },
              }),
            };
          if (url.includes('/api/v1/webtoon/123/episodes'))
            return {
              status: 200,
              body: JSON.stringify({
                success: true,
                result: {
                  episodeList: [
                    {
                      episodeNo: 1,
                      episodeTitle: 'Episode 1',
                      viewerLink: chapter,
                      exposureDateMillis: 1750000000000,
                    },
                  ],
                  nextCursor: 0,
                },
              }),
            };
          if (url.includes('/viewer?'))
            return {
              status: 200,
              body: `<script>var imageList = [{url: "${image}", sortOrder: 1}];</script>`,
            };
          if (url.includes('/list?'))
            return {
              status: 200,
              body: `<div class="detail_info_wrap"><div class="img_area"><img src="${cover}"></div><strong class="subject">Sample Story</strong><div class="author"><a>Creator</a></div><a class="summary">Description</a></div>`,
            };
          if (url.endsWith('/genres'))
            return {
              status: 200,
              body: '<li><a class="_genreShortcutItem" data-genre="ROMANCE"></a><span class="tit_genre">Romance</span></li>',
            };
          return {
            status: 200,
            body: `<a href="https://m.webtoons.com${series}" class="_titleItem"><div class="image_wrap"><img src="${cover}"></div><div class="info_text"><div class="genre">Romance</div><strong class="title">Sample Story</strong></div></a>`,
          };
        },
      },
    };
    runInNewContext(bundle, sandbox);

    expect((await sandbox.source.search('Sample Story'))[0].id).toBe(series);
    expect((await sandbox.source.manga(series)).title).toBe('Sample Story');
    expect((await sandbox.source.chapters(series))[0].id).toBe(chapter);
    expect((await sandbox.source.pages(chapter))[0].url).toBe(image);
    const discovery = await sandbox.source.discover();
    expect(discovery.sections[0].items[0].coverUrl).toBe(cover);
    expect(discovery.genres.some((genre) => genre.id === 'genre:romance')).toBe(true);
    expect((await sandbox.source.catalog(1, 'genre:romance')).items[0].id).toBe(series);
    expect(calls.some((url) => url.includes('/api/v1/webtoon/123/episodes'))).toBe(true);
  });
}
