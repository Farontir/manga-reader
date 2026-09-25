import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const bundle = await readFile(
  new URL('../source-repo/peppercarrot/bundle.js', import.meta.url),
  'utf8',
);
const sandbox = {
  URL,
  app: {
    fetch: async (url, options) => {
      const response = await fetch(url, options);
      return { status: response.status, body: await response.text() };
    },
  },
};
runInNewContext(bundle, sandbox);
const source = sandbox.source;
const manga = (await source.search('Pepper and Carrot'))[0];
if (manga?.id !== 'peppercarrot') throw new Error('La recherche HTML ne trouve pas la série.');
const chapters = await source.chapters(manga.id);
if (chapters.length < 30) throw new Error('La liste HTML des épisodes est incomplète.');
const first = chapters.find((chapter) => chapter.number === 1);
if (!first) throw new Error('Le premier épisode est absent.');
const pages = await source.pages(first.id);
if (pages.length < 3) throw new Error('Les images du premier épisode sont absentes.');
const response = await fetch(pages[0], { method: 'HEAD' });
if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
process.stdout.write(
  `${manga.title}: ${chapters.length} épisodes, ${pages.length} pages pour l’épisode 1; image HTTP ${response.status}\n`,
);
