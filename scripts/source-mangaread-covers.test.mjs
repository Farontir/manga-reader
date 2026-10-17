import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const small = 'https://www.mangaread.org/wp-content/uploads/cover-110x150.jpg';
const medium = 'https://www.mangaread.org/wp-content/uploads/cover-222x300.jpg';
const full = 'https://www.mangaread.org/wp-content/uploads/cover.jpg';
const img = `<img src="${small}" srcset="${small} 110w, ${medium} 222w, ${full} 720w">`;

it('uses the larger MangaRead cover in listings and manga details', async () => {
  const bundle = await readFile(
    new URL('../source-repo/mangaread/bundle.js', import.meta.url),
    'utf8',
  );
  const sandbox = {
    URL,
    URLSearchParams,
    app: {
      fetch: async (url) => ({
        status: 200,
        body: url.endsWith('/manga/example/')
          ? `<div class="post-title"><h1>Example</h1></div><div class="summary_image">${img}</div>`
          : `<div class="page-item-detail"><div class="item-thumb">${img}</div><div class="post-title"><a href="/manga/example/">Example</a></div></div>`,
      }),
    },
  };
  runInNewContext(bundle, sandbox);
  const catalog = await sandbox.source.catalog(1);
  expect(catalog.items[0].coverUrl).toBe(full);
  expect((await sandbox.source.manga('/manga/example/')).coverUrl).toBe(full);
});
