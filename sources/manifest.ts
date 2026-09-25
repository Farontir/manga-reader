import type { SourceManifest } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseManifest(value: unknown): SourceManifest {
  if (!isRecord(value)) throw new Error('Manifest invalide.');
  const { schemaVersion, id, name, version, language, contentRating, allowedHosts, bundle, sha256 } = value;
  if (schemaVersion !== 1 || typeof id !== 'string' || !/^[a-z0-9][a-z0-9.-]{2,63}$/.test(id)) {
    throw new Error('Identifiant de source invalide.');
  }
  if (typeof name !== 'string' || !name.trim() || typeof version !== 'string' || !version.trim() ||
      typeof language !== 'string' || !/^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(language)) {
    throw new Error('Métadonnées de source invalides.');
  }
  if (contentRating !== 'safe') throw new Error('Seules les sources tout public sont acceptées.');
  if (!Array.isArray(allowedHosts) || !allowedHosts.length || !allowedHosts.every((host) =>
    typeof host === 'string' && /^[a-z0-9.-]+$/i.test(host) && host.includes('.') &&
    host !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(host))) {
    throw new Error('Domaines autorisés invalides.');
  }
  if (typeof bundle !== 'string' || !bundle.trim() || typeof sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(sha256)) {
    throw new Error('Bundle ou empreinte SHA-256 invalide.');
  }
  return { schemaVersion: 1, id, name, version, language, contentRating,
    allowedHosts, bundle, sha256: sha256.toLowerCase() };
}

export function resolveManifestUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'https:') throw new Error('Une URL HTTPS est requise.');
  if (!url.pathname.endsWith('.json')) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/manifest.json`;
  }
  url.hash = '';
  return url.toString();
}

export function resolveBundleUrl(manifestUrl: string, bundle: string): string {
  const url = new URL(bundle, manifestUrl);
  if (url.protocol !== 'https:') throw new Error('Le bundle doit être servi en HTTPS.');
  return url.toString();
}
