import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const listing = `
  <div><a class="cover" href="/manga/allowed"><img alt="Allowed"></a>
    <p>Popular manga covering in Adult, Romance genres, written by Example.</p></div>
  <div><a class="cover" href="/manga/forbidden"><img alt="Forbidden"></a>
    <p>Popular manga covering in Shota, Fantasy genres, written by Example.</p></div>
`;
const detail = (title, genre) => `
  <h1>${title}</h1><div class="genre-list"><a>${genre}</a></div>
  <div id="contentBox">Example summary</div>
`;

describe.each(['mangabats', 'mangakakalot'])('%s classification', (name) => {
  it('classifies adult list items and excludes forbidden genres from lists and details', async () => {
    const bundle = await readFile(
      new URL(`../source-repo/${name}/bundle.js`, import.meta.url),
      'utf8',
    );
    const sandbox = {
      URL,
      app: {
        fetch: async (url) => {
          const path = new URL(url).pathname;
          if (path === '/manga/allowed') {
            return { status: 200, body: detail('Allowed', 'Adult') };
          }
          if (path === '/manga/forbidden') {
            return { status: 200, body: detail('Forbidden', 'Shota') };
          }
          if (path === '/home/search/json') return { status: 403, body: '' };
          return { status: 200, body: listing };
        },
      },
    };
    runInNewContext(bundle, sandbox);
    const source = sandbox.source;

    const recommendations = await source.recommendations();
    expect(recommendations.items).toHaveLength(1);
    expect(recommendations.items[0].contentRating).toBe('erotica');
    expect((await source.manga('/manga/allowed')).contentRating).toBe('erotica');
    await expect(source.manga('/manga/forbidden')).rejects.toThrow('indisponible');
    expect(await source.search('Forbidden')).toHaveLength(0);
  });
});
