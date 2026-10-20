import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const hosts = {
  peppercarrot: ['www.peppercarrot.com'],
  asurascans: ['asurascans.com'],
  mangabats: ['www.mangabats.com'],
  mangakakalot: ['www.mangakakalot.gg', 'www.mangabats.com'],
  flamecomics: ['flamecomics.xyz'],
  mangakatana: ['mangakatana.com'],
  mangadex: ['api.mangadex.org'],
  'komga-demo': ['demo.komga.org'],
  toonily: ['toonily.com'],
};

const minimumGenres = {
  asurascans: 30,
  mangabats: 200,
  mangakakalot: 200,
  flamecomics: 40,
  mangakatana: 40,
  mangadex: 70,
  peppercarrot: 1,
  'komga-demo': 1,
  toonily: 25,
};
const adultSources = new Set(['mangabats', 'mangakakalot', 'mangakatana', 'mangadex']);
const skipped = process.argv.find((argument) => argument.startsWith('--skip='))?.slice(7);

for (const [name, allowed] of Object.entries(hosts).filter(([name]) => name !== skipped)) {
  const bundle = await readFile(
    new URL(`../source-repo/${name}/bundle.js`, import.meta.url),
    'utf8',
  );
  const sandbox = {
    URL,
    URLSearchParams,
    btoa,
    encodeURIComponent,
    app: {
      fetch: async (url, options) => {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || !allowed.includes(parsed.hostname)) {
          throw new Error(`${name}: domaine inattendu ${url}`);
        }
        const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
        const body = await response.text();
        if (body.length > 2_000_000) throw new Error(`${name}: réponse trop volumineuse`);
        return { status: response.status, body };
      },
    },
  };
  runInNewContext(bundle, sandbox);
  const source = sandbox.source;
  const discovery = await source.discover();
  if (!discovery.sections?.length) throw new Error(`${name}: aucune section`);
  for (const section of discovery.sections) {
    if (!section.items?.length || !section.more) {
      throw new Error(`${name}: section « ${section.title} » vide ou sans catalogue`);
    }
    const listing = await source.catalog(1, section.more);
    if (!listing.items?.length) throw new Error(`${name}: catalogue « ${section.title} » vide`);
    if (listing.hasMore) {
      const second = await source.catalog(2, section.more);
      if (!second.items?.length || second.items[0].id === listing.items[0].id) {
        throw new Error(`${name}: pagination « ${section.title} » invalide`);
      }
    }
  }
  for (const genre of discovery.genres ?? []) {
    if (!genre.id || !genre.title) throw new Error(`${name}: genre invalide`);
  }
  if ((discovery.genres?.length ?? 0) < minimumGenres[name]) {
    throw new Error(`${name}: catégories incomplètes (${discovery.genres?.length ?? 0})`);
  }
  if (discovery.genres?.length) {
    const genre = discovery.genres[0];
    const listing = await source.catalog(1, genre.id);
    if (!listing.items?.length) throw new Error(`${name}: genre « ${genre.title} » vide`);
    if (listing.hasMore) {
      const second = await source.catalog(2, genre.id);
      if (!second.items?.length || second.items[0].id === listing.items[0].id) {
        throw new Error(`${name}: pagination du genre « ${genre.title} » invalide`);
      }
    }
  }
  if (adultSources.has(name)) {
    const adult = discovery.genres.find((genre) => genre.title === 'Adult');
    if (!adult) throw new Error(`${name}: catégorie Adult absente`);
    if (adult.sensitive !== true) throw new Error(`${name}: catégorie Adult non protégée`);
    const first = await source.catalog(1, adult.id);
    if (!first.items?.length) throw new Error(`${name}: catégorie Adult vide`);
    if (!first.items.every((item) => ['erotica', 'pornographic'].includes(item.contentRating))) {
      throw new Error(`${name}: titres Adult non classés`);
    }
    const detail = await source.manga(first.items[0].id);
    if (!['erotica', 'pornographic'].includes(detail.contentRating)) {
      throw new Error(`${name}: fiche Adult non classée`);
    }
    if (first.hasMore) {
      const second = await source.catalog(2, adult.id);
      if (!second.items?.length || first.items[0].id === second.items[0].id) {
        throw new Error(`${name}: pagination Adult invalide`);
      }
    }
  }
  if (name === 'asurascans') {
    const chapters = await source.chapters(discovery.sections[0].items[0].id);
    if (!chapters.some((chapter) => chapter.publishedAt)) {
      throw new Error('asurascans: dates des chapitres absentes');
    }
  }
  process.stdout.write(
    `${name}: ${discovery.sections.length} sections, ${discovery.genres?.length ?? 0} genres\n`,
  );
}
