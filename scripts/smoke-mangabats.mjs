import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const bundle = await readFile(
  new URL('../source-repo/mangabats/bundle.js', import.meta.url),
  'utf8',
);
const sandbox = {
  URL,
  encodeURIComponent,
  app: {
    fetch: async (url, options) => {
      if (new URL(url).hostname !== 'www.mangabats.com')
        throw new Error('Domaine source inattendu.');
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      const body = await response.text();
      if (body.length > 2_000_000) throw new Error('Réponse trop volumineuse pour le bridge.');
      return { status: response.status, body };
    },
  },
};
runInNewContext(bundle, sandbox);
const source = sandbox.source;
const result = (await source.search('One Piece')).find((item) => item.title === 'One Piece');
if (!result) throw new Error('La recherche par titre exact ne trouve pas One Piece.');
const partial = await source.search('Solo');
if (!partial.some((item) => item.title === 'Solo Leveling')) {
  throw new Error('Le repli de recherche dans les listes publiques ne trouve pas Solo Leveling.');
}
const manga = await source.manga(result.id);
if (manga.title !== 'One Piece' || !manga.coverUrl) throw new Error('Fiche manga invalide.');
const chapters = await source.chapters(manga.id);
if (chapters.length < 1000) throw new Error('Liste de chapitres incomplète.');
const first = chapters.find((chapter) => chapter.number === 1);
if (!first) throw new Error('Chapitre 1 absent.');
const pages = await source.pages(first.id);
if (pages.length < 10) throw new Error('Pages du chapitre 1 absentes.');
const page = await fetch(pages[0].url, {
  method: 'HEAD',
  headers: pages[0].headers,
  signal: AbortSignal.timeout(15000),
});
if (!page.ok || !page.headers.get('content-type')?.startsWith('image/')) {
  throw new Error(`Image HTTP ${page.status}.`);
}
const recommendations = await source.recommendations();
if (!recommendations.items.length) throw new Error('Recommandations absentes.');
if (!(await source.health())) throw new Error('Contrôle de santé en erreur.');
process.stdout.write(
  `${manga.title}: ${chapters.length} chapitres, ${pages.length} pages pour le chapitre 1; image HTTP ${page.status}\n`,
);
