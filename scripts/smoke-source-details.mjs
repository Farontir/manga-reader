import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const checks = [
  {
    name: 'asurascans',
    hosts: ['asurascans.com'],
    id: '/comics/the-heavenly-demon-wants-a-quiet-life-1bb35e56',
  },
  { name: 'mangabats', hosts: ['www.mangabats.com'], id: '/manga/martial-peak' },
  {
    name: 'mangakakalot',
    hosts: ['www.mangakakalot.gg', 'www.mangabats.com'],
    id: '/manga/martial-peak',
  },
  { name: 'flamecomics', hosts: ['flamecomics.xyz'], query: 'Black Haze' },
  {
    name: 'mangakatana',
    hosts: ['mangakatana.com'],
    id: '/manga/boukensha-ni-naritai-to-miyako-ni-deteitta-musume-ga-s-rank-ni-natteta.20711',
  },
  { name: 'peppercarrot', hosts: ['www.peppercarrot.com'], id: 'peppercarrot' },
  { name: 'komga-demo', hosts: ['demo.komga.org'], query: 'Moby Dick' },
];

for (const check of checks) {
  const bundle = await readFile(
    new URL(`../source-repo/${check.name}/bundle.js`, import.meta.url),
    'utf8',
  );
  const sandbox = {
    URL,
    btoa,
    encodeURIComponent,
    app: {
      fetch: async (url, options) => {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || !check.hosts.includes(parsed.hostname)) {
          throw new Error(`${check.name}: domaine inattendu ${url}`);
        }
        const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
        const body = await response.text();
        if (body.length > 2_000_000) throw new Error(`${check.name}: réponse trop volumineuse`);
        return { status: response.status, body };
      },
    },
  };
  runInNewContext(bundle, sandbox);
  const source = sandbox.source;
  const id = check.id ?? (await source.search(check.query))[0]?.id;
  if (!id) throw new Error(`${check.name}: série de contrôle introuvable`);
  const manga = await source.manga(id);
  if (!manga.title || !manga.genres?.length || !manga.authors?.length) {
    throw new Error(`${check.name}: genres ou auteurs manquants pour ${id}`);
  }
  if (
    manga.genres.some((genre) => typeof genre !== 'string' || !genre.trim()) ||
    manga.authors.some((author) => typeof author !== 'string' || !author.trim())
  ) {
    throw new Error(`${check.name}: métadonnées mal formées`);
  }
  process.stdout.write(
    `${check.name}: ${manga.title} — ${manga.genres.join(', ')} ; ${manga.authors.join(', ')}\n`,
  );
}
