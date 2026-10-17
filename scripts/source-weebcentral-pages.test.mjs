import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

it('keeps pages from both current and older WeebCentral image hosts', async () => {
  const bundle = await readFile(
    new URL('../source-repo/weebcentral/bundle.js', import.meta.url),
    'utf8',
  );
  const sandbox = {
    URL,
    URLSearchParams,
    app: {
      fetch: async () => ({
        status: 200,
        body: `<section id="chapter-images">
          <img src="https://temp.compsci88.com/manga/new/001.jpg">
          <img src="https://hot.planeptune.us/manga/old/002.png">
          <img src="https://unrelated.example/003.jpg">
        </section>`,
      }),
    },
  };
  runInNewContext(bundle, sandbox);
  const pages = await sandbox.source.pages('/chapters/01J76XYYRBXSRBVGVWAA4MZMD8');
  expect(pages.map((page) => page.url)).toEqual([
    'https://temp.compsci88.com/manga/new/001.jpg',
    'https://hot.planeptune.us/manga/old/002.png',
  ]);
  expect(pages.every((page) => page.headers.Referer === 'https://weebcentral.com/')).toBe(true);
});
