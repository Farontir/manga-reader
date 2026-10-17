import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

it('returns a stable Fanfox cover URL without expiring token parameters', async () => {
  const bundle = await readFile(
    new URL('../source-repo/fanfox/bundle.js', import.meta.url),
    'utf8',
  );
  const sandbox = {
    URL,
    app: {
      fetch: async () => ({
        status: 200,
        body: `<div class="detail-info-right-title-font">Example</div>
          <div class="detail-info-cover"><img src="https://fmcdn.mfcdn.net/store/manga/106/cover.jpg?token=old&ttl=1&v=123"></div>`,
      }),
    },
  };
  runInNewContext(bundle, sandbox);
  const manga = await sandbox.source.manga('/manga/example/');
  expect(manga.coverUrl).toBe('https://fmcdn.mfcdn.net/store/manga/106/cover.jpg?v=123');
});
