import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import {
  deleteSetting,
  getSetting,
  listImportedArchiveKeys,
  recordImportedArchive,
  setSetting,
} from '../db';
import { withImportLock } from './importLock';
import { importLocalChapter } from './localImport';

const WATCHED_FOLDER_KEY = 'import.watchedFolderUri';
const MAX_ARCHIVE_BYTES = 120 * 1024 * 1024;
// Bounds the recursive listing; already-imported files are skipped without being opened.
const MAX_ARCHIVES = 2000;
const ARCHIVE_NAME = /\.(?:cbz|zip)$/i;
// iCloud Drive lists files that are not downloaded yet as ".Name.cbz.icloud".
const CLOUD_PLACEHOLDER = /^\..+\.(?:cbz|zip)\.icloud$/i;

export type ArchiveCandidate = {
  file: File;
  name: string;
  folderName?: string;
  /** Identity in `imported_archives`; set for watched-folder scans only. */
  key?: string;
  /** Copy to the app cache first: files from a picked folder may not stay readable. */
  copy?: boolean;
};

export type ArchiveImportSummary = { imported: number; skipped: number; errors: string[] };

export type FolderSyncResult =
  | { status: 'no-folder' }
  | { status: 'no-access'; folderUri: string }
  | {
      status: 'done';
      folderName: string;
      listing: Omit<ArchiveListing, 'archives'>;
      summary: ArchiveImportSummary;
    };

type Progress = (index: number, total: number, name: string) => void;

export type ArchiveListing = { archives: File[]; notDownloaded: number; truncated: boolean };

export function findArchives(root: Directory): ArchiveListing {
  const listing: ArchiveListing = { archives: [], notDownloaded: 0, truncated: false };
  const visit = (folder: Directory, depth: number) => {
    if (depth > 5) return;
    for (const item of folder.list()) {
      if (listing.archives.length >= MAX_ARCHIVES) {
        listing.truncated = true;
        return;
      }
      if (item instanceof File && ARCHIVE_NAME.test(item.name)) listing.archives.push(item);
      else if (item instanceof File && CLOUD_PLACEHOLDER.test(item.name))
        listing.notDownloaded += 1;
      else if (item instanceof Directory) visit(item, depth + 1);
    }
  };
  visit(root, 0);
  listing.archives.sort((a, b) => a.uri.localeCompare(b.uri, undefined, { numeric: true }));
  return listing;
}

function archiveKey(root: Directory, file: File): string {
  const relative = file.uri.startsWith(root.uri) ? file.uri.slice(root.uri.length) : file.uri;
  return `${relative}|${file.size}`;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export async function importArchives(
  archives: ArchiveCandidate[],
  options: { entryId?: string; onProgress?: Progress } = {},
): Promise<ArchiveImportSummary> {
  const summary: ArchiveImportSummary = { imported: 0, skipped: 0, errors: [] };
  for (let index = 0; index < archives.length; index += 1) {
    const archive = archives[index];
    if (!archive) continue;
    options.onProgress?.(index, archives.length, archive.name);
    const cached = archive.copy
      ? new File(Paths.cache, `manga-import-${Crypto.randomUUID()}.cbz`)
      : null;
    try {
      if (archive.file.size > MAX_ARCHIVE_BYTES) throw new Error('CBZ de plus de 120 Mo');
      if (cached) archive.file.copy(cached);
      const result = await importLocalChapter({
        entryId: options.entryId,
        archive: cached ?? archive.file,
        archiveName: archive.name,
        archiveFolderName: archive.folderName,
        skipExisting: true,
      });
      if (result.imported) summary.imported += 1;
      else summary.skipped += 1;
      if (archive.key)
        await recordImportedArchive(archive.key, result.imported ? 'imported' : 'skipped');
    } catch (reason) {
      if (__DEV__) console.error('[import] archive', reason);
      summary.errors.push(`${archive.name} : ${errorMessage(reason)}`);
      if (archive.key) await recordImportedArchive(archive.key, 'failed', errorMessage(reason));
    } finally {
      if (cached) {
        try {
          if (cached.exists) cached.delete();
        } catch {
          // Cache cleanup must not change the import result.
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return summary;
}

export function getWatchedFolderUri(): Promise<string | null> {
  return getSetting(WATCHED_FOLDER_KEY);
}

export function watchFolder(folder: Directory): Promise<void> {
  return setSetting(WATCHED_FOLDER_KEY, folder.uri);
}

export function unwatchFolder(): Promise<void> {
  return deleteSetting(WATCHED_FOLDER_KEY);
}

/**
 * Imports the CBZ added to the watched folder since the last scan. Original files are
 * never modified. Failed archives are retried only when `retryFailed` is set.
 */
export function syncWatchedFolder(
  options: { retryFailed?: boolean; onProgress?: Progress } = {},
): Promise<FolderSyncResult> {
  return withImportLock(async () => {
    const folderUri = await getWatchedFolderUri();
    if (!folderUri) return { status: 'no-folder' };
    const root = new Directory(folderUri);
    let found: ArchiveListing;
    try {
      // expo-file-system keeps no security-scoped bookmark: after an app restart iOS
      // usually refuses to list the folder until the user picks it again.
      if (!root.exists) return { status: 'no-access', folderUri };
      found = findArchives(root);
    } catch {
      return { status: 'no-access', folderUri };
    }
    const handled = await listImportedArchiveKeys(!options.retryFailed);
    const pending = found.archives
      .map((file) => ({ file, key: archiveKey(root, file) }))
      .filter(({ key }) => !handled.has(key))
      .map(({ file, key }) => ({
        file,
        key,
        name: file.name,
        folderName: file.parentDirectory.name,
        copy: true,
      }));
    const summary = await importArchives(pending, { onProgress: options.onProgress });
    return {
      status: 'done',
      folderName: root.name,
      listing: { notDownloaded: found.notDownloaded, truncated: found.truncated },
      summary,
    };
  });
}
