import { describe, expect, it } from 'vitest';

import { parseBackup } from './backupFormat';

describe('backup validation', () => {
  it('rejects a malformed progress record before import', () => {
    expect(() =>
      parseBackup({
        version: 1,
        exportedAt: new Date().toISOString(),
        entries: [],
        bindings: [],
        chapters: [],
        sourceRepos: [],
        progress: [{ pageIndex: -1 }],
      }),
    ).toThrow('Progression invalide');
  });

  it('accepts an empty export', () => {
    expect(
      parseBackup({
        version: 1,
        exportedAt: new Date().toISOString(),
        entries: [],
        bindings: [],
        chapters: [],
        sourceRepos: [],
        progress: [],
      }).entries,
    ).toEqual([]);
  });
});
