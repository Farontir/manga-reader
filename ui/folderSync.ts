import { Directory } from 'expo-file-system';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import {
  getWatchedFolderUri,
  syncWatchedFolder,
  unwatchFolder,
  watchFolder,
  type FolderSyncResult,
} from '../services/folderSync';
import { successFeedback } from './haptics';

type FolderSyncState = {
  watchedFolderName: string | null;
  running: boolean;
  progress: string | null;
  needsAccess: boolean;
  message: string | null;
  /** Bumped after each import so screens reload the library. */
  libraryVersion: number;
};

export const useFolderSync = create<FolderSyncState>(() => ({
  watchedFolderName: null,
  running: false,
  progress: null,
  needsAccess: false,
  message: null,
  libraryVersion: 0,
}));

const AUTO_SYNC_INTERVAL_MS = 60 * 1000;
let lastAutoSync = 0;

export function describeSync(result: FolderSyncResult): string | null {
  if (result.status !== 'done') return null;
  const { summary, listing } = result;
  const parts: string[] = [];
  if (summary.imported)
    parts.push(`${summary.imported} CBZ importé(s) depuis « ${result.folderName} »`);
  if (summary.errors.length) parts.push(`${summary.errors.length} erreur(s)`);
  if (listing.notDownloaded)
    parts.push(`${listing.notDownloaded} fichier(s) iCloud pas encore téléchargé(s)`);
  if (listing.truncated) parts.push('dossier trop volumineux, choisis un sous-dossier');
  return parts.length ? `${parts.join(' · ')}.` : null;
}

async function refreshWatchedFolderName(): Promise<void> {
  const uri = await getWatchedFolderUri();
  useFolderSync.setState({ watchedFolderName: uri ? new Directory(uri).name : null });
}

/** Scans the watched folder. Automatic runs are throttled and never retry failed archives. */
export async function runFolderSync(manual: boolean): Promise<FolderSyncResult | null> {
  if (!manual) {
    if (Date.now() - lastAutoSync < AUTO_SYNC_INTERVAL_MS) return null;
    lastAutoSync = Date.now();
  }
  useFolderSync.setState({ running: true, progress: null });
  try {
    const result = await syncWatchedFolder({
      retryFailed: manual,
      onProgress: (index, total, name) =>
        useFolderSync.setState({ progress: `${index + 1} / ${total} · ${name}` }),
    });
    const imported = result.status === 'done' ? result.summary.imported : 0;
    useFolderSync.setState((state) => ({
      needsAccess: result.status === 'no-access',
      message:
        result.status === 'no-access'
          ? 'iOS a retiré l’accès au dossier surveillé. Rechoisis-le pour importer les nouveaux CBZ.'
          : (describeSync(result) ?? (manual ? 'Aucun nouveau CBZ.' : state.message)),
      libraryVersion: imported ? state.libraryVersion + 1 : state.libraryVersion,
    }));
    if (manual && imported) successFeedback();
    return result;
  } catch (reason) {
    useFolderSync.setState({
      message: `Synchronisation impossible : ${reason instanceof Error ? reason.message : String(reason)}`,
    });
    return null;
  } finally {
    useFolderSync.setState({ running: false, progress: null });
  }
}

/** Asks for a folder (opened where the previous one was), watches it and imports it. */
export async function pickWatchedFolder(): Promise<FolderSyncResult | null> {
  const previous = await getWatchedFolderUri();
  const folder = await Directory.pickDirectoryAsync(previous ?? undefined);
  await watchFolder(folder);
  await refreshWatchedFolderName();
  return runFolderSync(true);
}

export async function stopWatchingFolder(): Promise<void> {
  await unwatchFolder();
  useFolderSync.setState({ watchedFolderName: null, needsAccess: false, message: null });
}

export function dismissFolderSyncMessage(): void {
  useFolderSync.setState({ message: null });
}

/** Scans at startup and each time the app comes back to the foreground. */
export function useFolderSyncOnForeground(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    void refreshWatchedFolderName().catch(() => undefined);
    void runFolderSync(false);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runFolderSync(false);
    });
    return () => subscription.remove();
  }, [enabled]);
}
