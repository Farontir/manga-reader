import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const bundle = await readFile(
  new URL('../source-repo/mangadex/bundle.js', import.meta.url),
  'utf8',
);
const sandbox = {
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
const mangas = await source.search('Yotsuba');
if (!mangas.length) throw new Error('MangaDex search returned no manga.');
let checked = 0;
for (const manga of mangas.slice(0, 3)) {
  const chapters = await source.chapters(manga.id);
  for (const chapter of chapters.slice(0, 12)) {
    checked += 1;
    try {
      const pages = await source.pages(chapter.id);
      if (!pages.length) continue;
      const response = await fetch(pages[0], { method: 'HEAD' });
      if (!response.ok) continue;
      process.stdout.write(
        `${manga.title}: chapter ${chapter.number}, ${pages.length} pages; first page HTTP ${response.status}\n`,
      );
      process.exit(0);
    } catch {
      // Some chapters are unavailable or externally hosted; keep looking.
    }
  }
}
throw new Error(`No readable MangaDex chapter among ${checked} candidates.`);
