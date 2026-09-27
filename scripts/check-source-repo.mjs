import { writeFile } from 'node:fs/promises';

const checks = [
  {
    directory: 'mangadex',
    sourceId: 'org.mangadex.en',
    url: 'https://api.mangadex.org/manga?limit=1',
    options: {},
    valid: (body) => Array.isArray(body.data),
  },
  {
    directory: 'komga-demo',
    sourceId: 'org.komga.demo',
    url: 'https://demo.komga.org/api/v1/series/list?size=1',
    options: {
      method: 'POST',
      body: '{}',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + btoa('demo@komga.org:komga-demo'),
      },
    },
    valid: (body) => Array.isArray(body.content),
  },
  {
    directory: 'peppercarrot',
    sourceId: 'org.peppercarrot.en',
    url: 'https://www.peppercarrot.com/en/webcomics/peppercarrot.html',
    options: {},
    valid: (body) => /figure class="thumbnail/.test(body),
    format: 'text',
  },
  {
    directory: 'asurascans',
    sourceId: 'com.asurascans.en',
    url: 'https://asurascans.com/browse?sort=popular',
    options: {},
    valid: (body) => /\/asura-images\/covers\//.test(body),
    format: 'text',
  },
  {
    directory: 'mangabats',
    sourceId: 'com.mangabats.en',
    url: 'https://www.mangabats.com/manga-list/hot-manga',
    options: {},
    valid: (body) => /list-story-item bookmark_check cover/.test(body),
    format: 'text',
  },
  {
    directory: 'mangakakalot',
    sourceId: 'com.mangakakalot.gg.en',
    url: 'https://www.mangakakalot.gg/',
    options: {},
    valid: (body) => /class="[^"]*\bcover\b[^"]*"/.test(body),
    format: 'text',
    extraUrl: 'https://www.mangabats.com/manga/one-piece',
    extraValid: (body) => /<h1[^>]*>\s*One Piece\s*<\/h1>/.test(body),
  },
];

const selected = process.argv.find((argument) => argument.startsWith('--only='))?.slice(7);
for (const check of checks.filter((item) => !selected || item.directory === selected)) {
  const result = {
    sourceId: check.sourceId,
    checkedAt: new Date().toISOString(),
    status: 'down',
    httpStatus: null,
  };
  try {
    const response = await fetch(check.url, {
      ...check.options,
      signal: AbortSignal.timeout(15000),
    });
    result.httpStatus = response.status;
    const body = check.format === 'text' ? await response.text() : await response.json();
    if (response.ok && check.valid(body)) {
      if (check.extraUrl) {
        const extra = await fetch(check.extraUrl, { signal: AbortSignal.timeout(15000) });
        if (extra.ok && check.extraValid(await extra.text())) result.status = 'ok';
      } else {
        result.status = 'ok';
      }
    }
  } catch {
    /* A network error is reported as down. */
  }
  await writeFile(
    new URL(`../source-repo/${check.directory}/status.json`, import.meta.url),
    JSON.stringify(result, null, 2) + '\n',
  );
  process.stdout.write(`${result.sourceId}: ${result.status}\n`);
}
