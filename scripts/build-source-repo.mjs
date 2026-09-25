import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import prettier from 'prettier';

for (const name of ['mangadex', 'komga-demo', 'peppercarrot']) {
  const directory = new URL(`../source-repo/${name}/`, import.meta.url);
  if (name === 'peppercarrot') {
    await build({
      entryPoints: [fileURLToPath(new URL('source.js', directory))],
      outfile: fileURLToPath(new URL('bundle.js', directory)),
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      minify: true,
      legalComments: 'linked',
    });
    const packages = [
      'cheerio',
      'cheerio-select',
      'boolbase',
      'css-select',
      'css-what',
      'dom-serializer',
      'domhandler',
      'domutils',
      'htmlparser2',
      'nth-check',
      'entities',
      'parse5',
      'parse5/node_modules/entities',
      'parse5-htmlparser2-tree-adapter',
    ];
    const notices = ['Third-party notices for the Pepper&Carrot source bundle.'];
    for (const packagePath of packages) {
      const packageDirectory = new URL(`../node_modules/${packagePath}/`, import.meta.url);
      const info = JSON.parse(await readFile(new URL('package.json', packageDirectory), 'utf8'));
      const label = `${info.name}@${info.version} (${info.license ?? 'license unknown'})`;
      let license = '';
      try {
        license = await readFile(new URL('LICENSE', packageDirectory), 'utf8');
      } catch {
        license = `License text not included by upstream package. Package: ${info.repository?.url ?? info.homepage ?? info.name}`;
      }
      notices.push(`\n${'='.repeat(72)}\n${label}\n${'='.repeat(72)}\n${license.trim()}\n`);
    }
    await writeFile(new URL('THIRD_PARTY_LICENSES.txt', directory), notices.join('\n'));
  }
  const base = JSON.parse(await readFile(new URL('manifest.base.json', directory), 'utf8'));
  const bundle = await readFile(new URL('bundle.js', directory), 'utf8');
  const sha256 = createHash('sha256').update(bundle).digest('hex');
  await writeFile(
    new URL('manifest.json', directory),
    await prettier.format(JSON.stringify({ ...base, sha256 }), { parser: 'json', printWidth: 100 }),
  );
  process.stdout.write(`${name} manifest: ${sha256}\n`);
}
