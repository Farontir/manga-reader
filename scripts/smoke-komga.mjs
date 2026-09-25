import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const bundle = await readFile(
  new URL('../source-repo/komga-demo/bundle.js', import.meta.url),
  'utf8',
);
const sandbox = {
  btoa,
  URLSearchParams,
  app: {
    fetch: async (url, options) => {
      const response = await fetch(url, options);
      return { status: response.status, body: await response.text() };
    },
  },
};
runInNewContext(bundle, sandbox);
const source = sandbox.source;
const manga = (await source.search('Super Duck'))[0];
if (!manga) throw new Error('Komga search returned no result.');
const chapters = await source.chapters(manga.id);
if (!chapters.length) throw new Error('Komga returned no readable book.');
const pages = await source.pages(chapters[0].id);
if (!pages.length) throw new Error('Komga returned no pages.');
const response = await fetch(pages[0].url, { headers: pages[0].headers });
if (!response.ok) throw new Error(`Komga page HTTP ${response.status}`);
process.stdout.write(
  `${manga.title}: ${chapters.length} books, ${pages.length} pages; first page HTTP ${response.status}\n`,
);
