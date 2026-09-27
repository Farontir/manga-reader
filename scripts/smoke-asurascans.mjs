import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const bundle = await readFile(
  new URL('../source-repo/asurascans/bundle.js', import.meta.url),
  'utf8',
);
const allowedHosts = new Set(['asurascans.com', 'cdn.asurascans.com']);
const sandbox = {
  URL,
  encodeURIComponent,
  app: {
    fetch: async (url, options) => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
        throw new Error(`Unexpected source host: ${url}`);
      }
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      const body = await response.text();
      if (body.length > 2_000_000) throw new Error('Source response exceeds bridge limit.');
      return { status: response.status, body };
    },
  },
};
runInNewContext(bundle, sandbox);
const source = sandbox.source;
const results = await source.search('Omniscient Reader');
const found = results.find((manga) => manga.title.includes('Omniscient Reader'));
if (!found) throw new Error('Asura Scans search returned no matching series.');
const manga = await source.manga(found.id);
if (manga.title !== found.title || !manga.coverUrl) throw new Error('Series details are invalid.');
const chapters = await source.chapters(manga.id);
if (chapters.length < 100) throw new Error('Asura Scans chapter list is incomplete.');
const first = chapters.find((chapter) => chapter.number === 0);
if (!first) throw new Error('The public first chapter is missing.');
const pages = await source.pages(first.id);
if (pages.length < 3) throw new Error('The first chapter has no readable pages.');
const page = await fetch(pages[0], { method: 'HEAD', signal: AbortSignal.timeout(15000) });
if (!page.ok || !page.headers.get('content-type')?.startsWith('image/')) {
  throw new Error(`Chapter image HTTP ${page.status}.`);
}
const recommendations = await source.recommendations();
if (!recommendations.items.length) throw new Error('Asura Scans recommendations are empty.');
if (!(await source.health())) throw new Error('Asura Scans health check failed.');
process.stdout.write(
  `${manga.title}: ${chapters.length} chapitres, ${pages.length} pages pour le prologue; image HTTP ${page.status}\n`,
);
