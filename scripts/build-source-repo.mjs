import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import prettier from 'prettier';

for (const name of ['mangadex', 'komga-demo']) {
  const directory = new URL(`../source-repo/${name}/`, import.meta.url);
  const base = JSON.parse(await readFile(new URL('manifest.base.json', directory), 'utf8'));
  const bundle = await readFile(new URL('bundle.js', directory), 'utf8');
  const sha256 = createHash('sha256').update(bundle).digest('hex');
  await writeFile(
    new URL('manifest.json', directory),
    await prettier.format(JSON.stringify({ ...base, sha256 }), { parser: 'json', printWidth: 100 }),
  );
  process.stdout.write(`${name} manifest: ${sha256}\n`);
}
