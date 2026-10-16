import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { getSetting, listInstalledSources, setSetting, setSourceHealth } from '../db';
import { updateDecision } from '../services/sourceUpdates';
import { inspectSourceHealth } from '../sources/api';
import { installSource, previewSource } from '../sources/install';
import { waitForReaderToClose } from './libraryRefresh';

type SourceUpdatesState = {
  /** Updates that need the user (a source becoming adult): source id → offered version. */
  pending: Record<string, string>;
  /** Bumped after sources were updated, so screens reload them. */
  version: number;
};

export const useSourceUpdates = create<SourceUpdatesState>(() => ({ pending: {}, version: 0 }));

const LAST_CHECK_KEY = 'sources.autoUpdate.at';
const PENDING_KEY = 'sources.autoUpdate.pending';
const INTERVAL_MS = 6 * 60 * 60 * 1000;
let running: Promise<void> | null = null;

/** Installs newer versions of the installed sources, at most every 6 hours. */
export function autoUpdateSources(): Promise<void> {
  running ??= (async () => {
    if (!Object.keys(useSourceUpdates.getState().pending).length) {
      try {
        const saved: unknown = JSON.parse((await getSetting(PENDING_KEY)) ?? '{}');
        if (saved && typeof saved === 'object') {
          useSourceUpdates.setState({ pending: saved as Record<string, string> });
        }
      } catch {
        /* Ignore a malformed value. */
      }
    }
    const last = Date.parse((await getSetting(LAST_CHECK_KEY)) ?? '');
    if (Number.isFinite(last) && Date.now() - last < INTERVAL_MS) return;
    await setSetting(LAST_CHECK_KEY, new Date().toISOString());
    const pending: Record<string, string> = {};
    let updated = 0;
    for (const source of await listInstalledSources()) {
      try {
        const manifest = await previewSource(source.repoUrl);
        const decision = updateDecision(source, manifest);
        if (decision === 'confirm') pending[source.id] = manifest.version;
        if (decision !== 'update') continue;
        // The sandbox is shared: let an open reader finish its page requests first.
        await waitForReaderToClose();
        const installed = await installSource(source.repoUrl);
        await setSourceHealth(installed.id, await inspectSourceHealth(installed));
        updated += 1;
      } catch {
        /* Unreachable repository: try again at the next check. */
      }
    }
    await setSetting(PENDING_KEY, JSON.stringify(pending));
    useSourceUpdates.setState((state) => ({
      pending,
      version: state.version + (updated ? 1 : 0),
    }));
  })().finally(() => {
    running = null;
  });
  return running;
}

/** A manual update in Réglages → Sources settles any pending one. */
export function clearPendingUpdate(sourceId: string): void {
  const pending = { ...useSourceUpdates.getState().pending };
  delete pending[sourceId];
  useSourceUpdates.setState({ pending });
  void setSetting(PENDING_KEY, JSON.stringify(pending)).catch(() => undefined);
}

/** Checks at launch and whenever the app comes back to the foreground. */
export function useSourceUpdatesOnForeground(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    void autoUpdateSources().catch(() => undefined);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void autoUpdateSources().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [enabled]);
}
