import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

for (const name of ['mangadex', 'komga-demo', 'peppercarrot', 'asurascans']) {
  const directory = new URL(`../source-repo/${name}/`, import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  const bundle = await readFile(new URL('bundle.js', directory));
  const actual = createHash('sha256').update(bundle).digest('hex');
  if (actual !== manifest.sha256) {
    throw new Error(`${name}: empreinte du bundle incorrecte`);
  }
  if (bundle.length > 2_000_000) throw new Error(`${name}: bundle trop volumineux`);
  process.stdout.write(`${name}: empreinte SHA-256 vérifiée\n`);
}
