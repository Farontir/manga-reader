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

  it('rejects references to entries absent from the backup', () => {
    expect(() =>
      parseBackup({
        version: 1,
        exportedAt: new Date().toISOString(),
        entries: [],
        bindings: [],
        chapters: [],
        sourceRepos: [],
        progress: [
          {
            libraryEntryId: 'missing',
            chapterNumber: 1,
            pageIndex: 0,
            totalPages: 10,
            readAt: new Date().toISOString(),
            completed: false,
          },
        ],
      }),
    ).toThrow('Références de sauvegarde incohérentes');
  });

  it('rejects malformed optional chapter metadata before SQLite import', () => {
    expect(() =>
      parseBackup({
        version: 1,
        exportedAt: new Date().toISOString(),
        entries: [],
        bindings: [],
        progress: [],
        sourceRepos: [],
        chapters: [
          {
            libraryEntryId: 'missing',
            sourceId: 'example',
            chapterId: 'one',
            number: 1,
            title: {},
            language: null,
            publishedAt: null,
            fetchedAt: new Date().toISOString(),
          },
        ],
      }),
    ).toThrow('Chapitre invalide');
  });
});
