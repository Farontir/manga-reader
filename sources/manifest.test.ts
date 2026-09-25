import { describe, expect, it } from 'vitest';

import { parseManifest, resolveBundleUrl, resolveManifestUrl } from './manifest';

const valid = {
  schemaVersion: 1, id: 'org.example.manga', name: 'Exemple', version: '1.0.0',
  language: 'fr', contentRating: 'safe', allowedHosts: ['api.example.org'],
  bundle: './bundle.js', sha256: 'a'.repeat(64),
};

describe('source manifest', () => {
  it('resolves relative bundle URLs', () => {
    expect(resolveManifestUrl('https://example.org/sources')).toBe('https://example.org/sources/manifest.json');
    expect(resolveBundleUrl('https://example.org/sources/manifest.json', './bundle.js'))
      .toBe('https://example.org/sources/bundle.js');
  });

  it('refuses unsafe manifests', () => {
    expect(parseManifest(valid).id).toBe(valid.id);
    expect(() => parseManifest({ ...valid, contentRating: 'adult' })).toThrow();
    expect(() => parseManifest({ ...valid, allowedHosts: ['127.0.0.1'] })).toThrow();
    expect(() => resolveManifestUrl('http://example.org')).toThrow();
  });
});
