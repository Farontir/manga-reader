import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const bundle = await readFile(
  new URL('../source-repo/komga-demo/bundle.js', import.meta.url),
  'utf8',
);

it('exposes Komga ratings, sensitive genres, alternate titles and release dates', async () => {
  const requests = [];
  const series = {
    id: 'series-1',
    name: 'Example',
    metadata: {
      title: 'Example',
      summary: 'A demo series',
      genres: ['Adult', 'Fantasy'],
      alternateTitles: [{ label: 'Original', title: 'Original title' }],
    },
  };
  const excludedSeries = {
    id: 'excluded-series',
    metadata: { title: 'Excluded', genres: ['Shota'] },
  };
  const book = {
    id: 'book-1',
    metadata: {
      numberSort: 1,
      title: 'Chapter 1',
      releaseDate: '2026-10-16',
      authors: [{ name: 'Example Author' }],
    },
    media: { pagesCount: 10 },
  };
  const responses = {
    '/api/v1/series/new?size=20': { content: [series, excludedSeries] },
    '/api/v1/series/updated?size=20': { content: [series, excludedSeries] },
    '/api/v2/genres?unpaged=true': { content: ['Adult', 'Fantasy', 'Shota'] },
    '/api/v1/series/list?size=30': { content: [series, excludedSeries] },
    '/api/v1/series/list?size=30&page=0&sort=metadata.titleSort%2Casc': {
      content: [series, excludedSeries],
      last: true,
    },
    '/api/v1/series/series-1': series,
    '/api/v1/series/excluded-series': excludedSeries,
    '/api/v1/series/series-1/books?size=1': { content: [book] },
    '/api/v1/series/series-1/books?size=500': { content: [book] },
  };
  const sandbox = {
    btoa,
    app: {
      fetch: async (url, options) => {
        const path = new URL(url).pathname + new URL(url).search;
        requests.push({ path, options });
        if (!(path in responses)) throw new Error(`Unexpected Komga path: ${path}`);
        return { status: 200, body: JSON.stringify(responses[path]) };
      },
    },
  };
  runInNewContext(bundle, sandbox);
  const source = sandbox.source;

  const discover = await source.discover();
  expect(discover.genres.find((genre) => genre.title === 'Adult').sensitive).toBe(true);
  expect(discover.genres.some((genre) => genre.title === 'Shota')).toBe(false);
  expect(discover.sections[0].items[0].contentRating).toBe('erotica');
  expect(discover.sections[0].items).toHaveLength(1);

  expect(await source.search('Example')).toHaveLength(1);

  const catalog = await source.catalog(1, 'genre:Adult');
  expect(catalog.items).toHaveLength(1);
  expect(catalog.items[0].altTitles[0]).toBe('Original title');
  const catalogRequest = requests.find((request) => request.path.includes('page=0&sort='));
  expect(JSON.parse(catalogRequest.options.body).condition.genre.value).toBe('Adult');

  const detail = await source.manga('series-1');
  expect(detail.contentRating).toBe('erotica');
  await expect(source.manga('excluded-series')).rejects.toThrow('indisponible');
  await expect(source.catalog(1, 'genre:Shota')).rejects.toThrow('Genre Komga inconnu');
  expect((await source.chapters('series-1'))[0].publishedAt).toBe('2026-10-16');
});
