import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { getInstalledSource, putInstalledSource, removeInstalledSource, type InstalledSource } from '../db';
import { parseManifest, resolveBundleUrl, resolveManifestUrl } from './manifest';

async function fetchText(url: string, maxBytes: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} pour ${url}`);
    const text = await response.text();
    if (text.length > maxBytes) throw new Error('Fichier de source trop volumineux.');
    return text;
  } finally { clearTimeout(timeout); }
}

export async function installSource(inputUrl: string): Promise<InstalledSource> {
  const manifestUrl = resolveManifestUrl(inputUrl);
  const raw = await fetchText(manifestUrl, 64000);
  const manifest = parseManifest(JSON.parse(raw) as unknown);
  const bundleUrl = resolveBundleUrl(manifestUrl, manifest.bundle);
  const bundle = await fetchText(bundleUrl, 2_000_000);
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, bundle);
  if (digest.toLowerCase() !== manifest.sha256) throw new Error('Empreinte du bundle incorrecte.');

  const directory = new Directory(Paths.document, 'sources', manifest.id);
  directory.create({ idempotent: true, intermediates: true });
  const file = new File(directory, 'bundle.js');
  file.write(bundle);
  const existing = await getInstalledSource(manifest.id);
  const source: InstalledSource = {
    id: manifest.id, name: manifest.name, version: manifest.version,
    language: manifest.language, contentRating: manifest.contentRating,
    repoUrl: manifestUrl, bundleUri: file.uri, manifestJson: JSON.stringify(manifest),
    installedAt: existing?.installedAt ?? new Date().toISOString(),
    lastHealthCheck: null, healthStatus: null,
  };
  await putInstalledSource(source);
  return source;
}

export async function uninstallSource(source: InstalledSource): Promise<void> {
  await removeInstalledSource(source.id);
  const directory = new Directory(Paths.document, 'sources', source.id);
  if (directory.exists) directory.delete();
}
