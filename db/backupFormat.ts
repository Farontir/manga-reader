import type { Chapter, LibraryEntry, Progress, SourceBinding } from './schema';

export type BackupSnapshot = {
  version: 1;
  exportedAt: string;
  entries: LibraryEntry[];
  bindings: SourceBinding[];
  progress: Progress[];
  chapters: Chapter[];
  sourceRepos: string[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseBackup(value: unknown): BackupSnapshot {
  const root = record(value);
  if (
    !root ||
    root.version !== 1 ||
    !validDate(root.exportedAt) ||
    !Array.isArray(root.entries) ||
    !Array.isArray(root.bindings) ||
    !Array.isArray(root.progress) ||
    !Array.isArray(root.chapters) ||
    !Array.isArray(root.sourceRepos)
  ) {
    throw new Error('Format de sauvegarde non reconnu.');
  }
  for (const raw of root.entries) {
    const item = record(raw);
    if (
      !item ||
      !nonEmptyString(item.id) ||
      !nonEmptyString(item.canonicalTitle) ||
      !Array.isArray(item.altTitles) ||
      !item.altTitles.every((title) => typeof title === 'string') ||
      !validNullableString(item.coverUrl) ||
      !(
        item.anilistId === null ||
        (Number.isInteger(item.anilistId) && (item.anilistId as number) > 0)
      ) ||
      !validNullableString(item.description) ||
      !validNullableString(item.status) ||
      !validDate(item.addedAt) ||
      !(item.lastReadAt === null || validDate(item.lastReadAt))
    ) {
      throw new Error('Entrée de bibliothèque invalide dans la sauvegarde.');
    }
  }
  for (const raw of root.progress) {
    const item = record(raw);
    if (
      !item ||
      !nonEmptyString(item.libraryEntryId) ||
      typeof item.chapterNumber !== 'number' ||
      !Number.isFinite(item.chapterNumber) ||
      typeof item.pageIndex !== 'number' ||
      !Number.isInteger(item.pageIndex) ||
      item.pageIndex < 0 ||
      !(
        item.totalPages === null ||
        (Number.isInteger(item.totalPages) && (item.totalPages as number) > 0)
      ) ||
      !validDate(item.readAt) ||
      typeof item.completed !== 'boolean'
    ) {
      throw new Error('Progression invalide dans la sauvegarde.');
    }
  }
  for (const raw of root.bindings) {
    const item = record(raw);
    if (
      !item ||
      !nonEmptyString(item.id) ||
      !nonEmptyString(item.libraryEntryId) ||
      !nonEmptyString(item.sourceId) ||
      !nonEmptyString(item.mangaId) ||
      typeof item.priority !== 'number' ||
      !Number.isInteger(item.priority) ||
      !(item.lastSeenOk === null || validDate(item.lastSeenOk)) ||
      !validNullableString(item.lastError)
    )
      throw new Error('Liaison invalide dans la sauvegarde.');
  }
  for (const raw of root.chapters) {
    const item = record(raw);
    if (
      !item ||
      !nonEmptyString(item.libraryEntryId) ||
      !nonEmptyString(item.sourceId) ||
      !nonEmptyString(item.chapterId) ||
      typeof item.number !== 'number' ||
      !Number.isFinite(item.number) ||
      !validNullableString(item.title) ||
      !validNullableString(item.language) ||
      !(item.publishedAt === null || validDate(item.publishedAt)) ||
      !validDate(item.fetchedAt)
    ) {
      throw new Error('Chapitre invalide dans la sauvegarde.');
    }
  }
  if (!root.sourceRepos.every(httpsUrl)) {
    throw new Error('Dépôt de source invalide dans la sauvegarde.');
  }
  const ids = new Set(root.entries.map((entry) => (entry as { id: string }).id));
  if (
    ids.size !== root.entries.length ||
    [...root.bindings, ...root.progress, ...root.chapters].some(
      (item) => !ids.has((item as { libraryEntryId: string }).libraryEntryId),
    )
  ) {
    throw new Error('Références de sauvegarde incohérentes.');
  }
  return root as BackupSnapshot;
}
