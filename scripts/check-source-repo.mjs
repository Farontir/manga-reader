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
];

for (const check of checks) {
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
    if (response.ok && check.valid(await response.json())) result.status = 'ok';
  } catch {
    /* A network error is reported as down. */
  }
  await writeFile(
    new URL(`../source-repo/${check.directory}/status.json`, import.meta.url),
    JSON.stringify(result, null, 2) + '\n',
  );
  process.stdout.write(`${result.sourceId}: ${result.status}\n`);
}
