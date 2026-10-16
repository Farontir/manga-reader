import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const probes = {
  mangaread: { query: 'One Piece', hosts: ['www.mangaread.org'] },
  'webtoon-en': { query: 'Love 4 a Walk', hosts: ['www.webtoons.com'] },
  'webtoon-fr': { query: 'Eleceed', hosts: ['www.webtoons.com'] },
  fanfox: { query: 'One Piece', hosts: ['fanfox.net', 'm.fanfox.net'] },
  weebcentral: { query: 'One Piece', hosts: ['weebcentral.com'] },
  sushiscan: { query: 'One Piece', hosts: ['sushiscan.net'] },
};

for (const name of process.argv.slice(2)) {
  try {
    const probe = probes[name];
    if (!probe) throw new Error(`Source inconnue : ${name}`);
    const code = await readFile(
      new URL(`../source-repo/${name}/bundle.js`, import.meta.url),
      'utf8',
    );
    const context = {
      URL,
      URLSearchParams,
      app: {
        fetch: async (url, options) => {
          const parsed = new URL(url);
          if (parsed.protocol !== 'https:' || !probe.hosts.includes(parsed.hostname)) {
            throw new Error(`Hôte interdit : ${url}`);
          }
          const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
          const body = await response.text();
          if (body.length > (name === 'weebcentral' ? 3_000_000 : 2_000_000))
            throw new Error(`Réponse trop volumineuse : ${body.length}`);
          return { status: response.status, body };
        },
      },
    };
    runInNewContext(code, context);
    const source = context.source;
    const results = await source.search(probe.query);
    if (!results.length) throw new Error(`${name} : recherche vide`);
    const selected =
      name === 'mangaread'
        ? results[0]
        : (results.find((item) => item.title.toLowerCase() === probe.query.toLowerCase()) ??
          results[0]);
    const manga = await source.manga(selected.id);
    const chapters = await source.chapters(manga.id);
    if (!chapters.length) throw new Error(`${name} : aucun chapitre pour ${manga.title}`);
    const pages = await source.pages(chapters[0].id);
    if (!pages.length) throw new Error(`${name} : aucune page pour ${manga.title}`);
    const firstPage = typeof pages[0] === 'string' ? { url: pages[0] } : pages[0];
    const imageResponse = await fetch(firstPage.url, {
      headers: firstPage.headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!imageResponse.ok || !imageResponse.headers.get('content-type')?.startsWith('image/')) {
      throw new Error(`${name} : image illisible (HTTP ${imageResponse.status})`);
    }
    await imageResponse.body?.cancel();
    const discover = await source.discover();
    if (!discover.sections?.some((section) => section.items?.length))
      throw new Error(`${name} : Découvrir vide`);
    const catalog = await source.catalog(1);
    if (!catalog.items?.length) throw new Error(`${name} : catalogue vide`);
    console.log(
      `${name}: ${results.length} résultats, ${chapters.length} chapitres, ${pages.length} pages, ${discover.genres?.length ?? 0} genres`,
    );
  } catch (error) {
    console.error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    break;
  }
}
