import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const hosts = {
  peppercarrot: ['www.peppercarrot.com'],
  asurascans: ['asurascans.com'],
  mangabats: ['www.mangabats.com'],
  mangakakalot: ['www.mangakakalot.gg', 'www.mangabats.com'],
  flamecomics: ['flamecomics.xyz'],
  mangakatana: ['mangakatana.com'],
};

for (const [name, allowed] of Object.entries(hosts)) {
  const bundle = await readFile(
    new URL(`../source-repo/${name}/bundle.js`, import.meta.url),
    'utf8',
  );
  const sandbox = {
    URL,
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
  if (name !== 'peppercarrot' && !discovery.genres?.length) {
    throw new Error(`${name}: aucun genre navigable`);
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
  process.stdout.write(
    `${name}: ${discovery.sections.length} sections, ${discovery.genres?.length ?? 0} genres\n`,
  );
}
