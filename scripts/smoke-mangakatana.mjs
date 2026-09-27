import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const bundle = await readFile(
  new URL('../source-repo/mangakatana/bundle.js', import.meta.url),
  'utf8',
);
const sandbox = {
  URL,
  app: {
    fetch: async (url, options) => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'mangakatana.com') {
        throw new Error('Domaine source inattendu.');
      }
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      const body = await response.text();
      if (body.length > 2_000_000) throw new Error('Réponse trop volumineuse pour le bridge.');
      return { status: response.status, body };
    },
  },
};
runInNewContext(bundle, sandbox);
const source = sandbox.source;
const result = (await source.search('Eminence in Shadow')).find(
  (item) => item.title === 'The Eminence in Shadow',
);
if (!result?.coverUrl) throw new Error('La recherche ou la couverture est absente.');
if ((await source.search('Marriage Gray')).some((item) => item.title === 'Marriage Gray')) {
  throw new Error('Un titre étiqueté Ecchi ne doit pas apparaître dans cette source sûre.');
}
const manga = await source.manga(result.id);
if (manga.title !== result.title || !manga.description) throw new Error('Fiche manga invalide.');
const chapters = await source.chapters(manga.id);
if (chapters.length < 80) throw new Error('Liste de chapitres incomplète.');
const latest = chapters.reduce((a, b) => (a.number > b.number ? a : b));
const pages = await source.pages(latest.id);
if (pages.length < 10) throw new Error('Pages du chapitre absentes.');
const image = await fetch(pages[0].url, {
  method: 'HEAD',
  headers: pages[0].headers,
  signal: AbortSignal.timeout(15000),
});
if (!image.ok) throw new Error(`Image HTTP ${image.status}.`);
const recommendations = await source.recommendations();
if (!recommendations.items.length) throw new Error('Recommandations absentes.');
if (!(await source.health())) throw new Error('Contrôle de santé en erreur.');
process.stdout.write(
  `${manga.title}: ${chapters.length} chapitres, ${pages.length} pages pour le chapitre ${latest.number}; image HTTP ${image.status}\n`,
);
