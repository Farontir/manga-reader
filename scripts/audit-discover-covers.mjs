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
];

for (const name of names) {
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
          const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
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
      if (!samples.has(host)) samples.set(host, item.coverUrl);
    }
    const missing = items
      .filter((item) => !item.coverUrl)
      .slice(0, 3)
      .map((item) => item.title);
    const checks = [];
    for (const [host, url] of samples) {
      try {
        const source = coverImageSource(url);
        const response = await fetch(url, {
          headers: source.headers,
          signal: AbortSignal.timeout(15000),
        });
        checks.push(
          `${host}:${response.status}/${response.headers.get('content-type')?.split(';')[0] ?? '?'}`,
        );
        await response.body?.cancel();
      } catch (error) {
        checks.push(`${host}:ERR ${error.message}`);
      }
    }
    console.log(
      `${name}: covers=${covered.length}/${items.length} missing=${JSON.stringify(missing)} ${checks.join(' ')}`,
    );
  } catch (error) {
    console.log(`${name}: ERROR ${error instanceof Error ? error.message : String(error)}`);
  }
}
