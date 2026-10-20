import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { coverImageSource } from '../services/coverImage.ts';

const names = [
  'mangadex',
  'komga-demo',
  'peppercarrot',
  'asurascans',
  'mangabats',
  'mangakakalot',
  'flamecomics',
  'mangakatana',
  'mangaread',
  'webtoon-en',
  'webtoon-fr',
  'fanfox',
  'weebcentral',
  'sushiscan',
  'toonily',
];

const mobile = process.argv.includes('--mobile');
const selected = process.argv.slice(2).filter((item) => item !== '--mobile');
for (const name of names.filter((item) => !selected.length || selected.includes(item))) {
  try {
    const directory = new URL(`../source-repo/${name}/`, import.meta.url);
    const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
    const bundle = await readFile(new URL('bundle.js', directory), 'utf8');
    const context = {
      URL,
      URLSearchParams,
      btoa,
      atob,
      encodeURIComponent,
      decodeURIComponent,
      app: {
        fetch: async (url, options) => {
          const parsed = new URL(url);
          if (parsed.protocol !== 'https:' || !manifest.allowedHosts.includes(parsed.hostname))
            throw new Error(`Hôte interdit : ${parsed.hostname}`);
          const response = await fetch(url, {
            ...options,
            headers:
              mobile && name.startsWith('webtoon-')
                ? {
                    ...options?.headers,
                    'User-Agent':
                      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
                  }
                : options?.headers,
            signal: AbortSignal.timeout(20000),
          });
          const body = await response.text();
          if (body.length > (name === 'weebcentral' ? 3_000_000 : 2_000_000))
            throw new Error(`Réponse trop volumineuse : ${body.length}`);
          return { status: response.status, body };
        },
      },
    };
    runInNewContext(bundle, context);
    const discovery = await context.source.discover();
    const items = discovery.sections.flatMap((section) => section.items);
    const covered = items.filter((item) => !!item.coverUrl);
    const samples = new Map();
    for (const item of covered) {
      const host = new URL(item.coverUrl).hostname;
      if (!samples.has(host)) samples.set(host, []);
      if (samples.get(host).length < 5) samples.get(host).push(item.coverUrl);
    }
    const missing = items
      .filter((item) => !item.coverUrl)
      .slice(0, 3)
      .map((item) => item.title);
    const checks = [];
    for (const [host, urls] of samples) {
      for (const url of urls) {
        try {
          const source = coverImageSource(url);
          const response = await fetch(url, {
            headers:
              mobile && name.startsWith('webtoon-')
                ? {
                    ...source.headers,
                    'User-Agent':
                      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
                  }
                : source.headers,
            signal: AbortSignal.timeout(15000),
          });
          checks.push(
            `${host}:${response.status}/${response.headers.get('content-type')?.split(';')[0] ?? '?'}/${response.headers.get('content-length') ?? '?'}`,
          );
          await response.body?.cancel();
        } catch (error) {
          checks.push(`${host}:ERR ${error.message}`);
        }
      }
    }
    console.log(
      `${name}: covers=${covered.length}/${items.length} missing=${JSON.stringify(missing)} ${checks.join(' ')}`,
    );
  } catch (error) {
    console.log(`${name}: ERROR ${error instanceof Error ? error.message : String(error)}`);
  }
}
