import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Check actual image responses throughout chapters; a valid chapter listing alone
// does not mean that its middle and final pages can be read on a device.
const samples = {
  asurascans: { id: '/comics/the-heavenly-demon-wants-a-quiet-life-1bb35e56' },
  mangabats: { id: '/manga/martial-peak' },
  mangakakalot: { id: '/manga/martial-peak' },
  flamecomics: { query: 'Black Haze' },
  mangakatana: {
    id: '/manga/boukensha-ni-naritai-to-miyako-ni-deteitta-musume-ga-s-rank-ni-natteta.20711',
  },
  mangaread: { query: 'One Piece' },
  'webtoon-en': { query: 'Love 4 a Walk' },
  'webtoon-fr': { query: 'Eleceed' },
  fanfox: { query: 'One Piece' },
  weebcentral: { query: 'One Piece' },
  sushiscan: { query: 'One Piece' },
  toonily: { query: 'Solo Leveling' },
  peppercarrot: { id: 'peppercarrot' },
  mangadex: { query: 'Yotsuba' },
  'komga-demo': { query: 'Super Duck' },
};

const deep = process.argv.includes('--deep');
const selected = process.argv.slice(2).filter((arg) => arg !== '--deep');
const names = selected.length ? selected : Object.keys(samples);
const timeout = (ms) => AbortSignal.timeout(ms);

async function checkImage(page) {
  const item = typeof page === 'string' ? { url: page } : page;
  const response = await fetch(item.url, {
    headers: item.headers,
    signal: timeout(15000),
  });
  const type = response.headers.get('content-type') || '';
  const reader = response.body?.getReader();
  const chunk = await reader?.read();
  await reader?.cancel();
  const bytes = chunk?.value ?? new Uint8Array();
  const signature = Array.from(bytes.slice(0, 12), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const image = type.startsWith('image/') || /^(ffd8ff|89504e47|47494638|52494646)/.test(signature);
  return { status: response.status, type, image, host: new URL(item.url).hostname };
}

async function audit(name) {
  const sample = samples[name];
  if (!sample) throw new Error(`Source inconnue : ${name}`);
  const manifest = JSON.parse(
    await readFile(new URL(`../source-repo/${name}/manifest.json`, import.meta.url)),
  );
  const bundle = await readFile(
    new URL(`../source-repo/${name}/bundle.js`, import.meta.url),
    'utf8',
  );
  const context = {
    URL,
    URLSearchParams,
    btoa,
    atob,
    encodeURIComponent,
    app: {
      fetch: async (url, options) => {
        const address = new URL(url);
        if (address.protocol !== 'https:' || !manifest.allowedHosts.includes(address.hostname))
          throw new Error(`Hôte interdit : ${address.hostname}`);
        const response = await fetch(url, { ...options, signal: timeout(20000) });
        const body = await response.text();
        if (body.length > (name === 'weebcentral' ? 3_000_000 : 2_000_000))
          throw new Error(`Réponse trop volumineuse : ${body.length}`);
        return { status: response.status, body };
      },
    },
  };
  runInNewContext(bundle, context);
  const source = context.source;
  const id = sample.id ?? (await source.search(sample.query))[0]?.id;
  if (!id) throw new Error('Série introuvable');
  const chapters = await source.chapters(id);
  if (!chapters.length) throw new Error('Aucun chapitre');
  const chosen = [...new Set([0, Math.floor(chapters.length / 2), chapters.length - 1])].map(
    (index) => chapters[index],
  );
  const results = [];
  for (const chapter of chosen) {
    let pages;
    try {
      pages = await source.pages(chapter.id);
    } catch (error) {
      results.push(`${chapter.number} ${chapter.id}: extraction ${error.message}`);
      process.exitCode = 1;
      continue;
    }
    if (!pages.length) {
      results.push(`${chapter.number}: 0 page`);
      process.exitCode = 1;
      continue;
    }
    const positions = [
      ...new Set(
        (deep ? [0, 1, 2, 3, 4, 5, 6] : [0, 3, 6]).map((part) =>
          Math.floor(((pages.length - 1) * part) / 6),
        ),
      ),
    ];
    const checks = await Promise.all(
      positions.map(async (index) => {
        try {
          const result = await checkImage(pages[index]);
          if (result.status < 200 || result.status >= 300 || !result.image) process.exitCode = 1;
          return `${index + 1}/${pages.length}=${result.status}${result.image ? '' : ` ${result.type || 'non-image'}`}@${result.host}`;
        } catch (error) {
          process.exitCode = 1;
          return `${index + 1}/${pages.length}=${error.message}`;
        }
      }),
    );
    results.push(`${chapter.number}: ${checks.join(', ')}`);
  }
  return `${name} (${chapters.length} chapitres): ${results.join(' | ')}`;
}

for (const name of names) {
  try {
    console.log(await audit(name));
  } catch (error) {
    console.log(`${name}: ERREUR ${error.message}`);
    process.exitCode = 1;
  }
}
