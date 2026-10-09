import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { refreshLibraryChapters } from '../services/libraryRefresh';
import { useReaderState } from './store';

type LibraryRefreshState = {
  running: boolean;
  done: number;
  total: number;
  /** Bumped after each refresh so the library reloads its unread counts. */
  version: number;
};

export const useLibraryRefresh = create<LibraryRefreshState>(() => ({
  running: false,
  done: 0,
  total: 0,
  version: 0,
}));

// Automatic checks (library focus, app back to foreground) run at most this often.
const AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
let lastAutoRefresh = 0;
let current: Promise<void> | null = null;

// Sources share one sandbox queue: while the reader is open, let its page requests go first.
async function waitForReaderToClose(): Promise<void> {
  while (useReaderState.getState().open) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** Looks for new chapters of every linked bookmarked manga; `force` skips the throttle. */
export function refreshLibrary(force: boolean): Promise<void> {
  if (current) return current;
  if (!force && Date.now() - lastAutoRefresh < AUTO_REFRESH_INTERVAL_MS) return Promise.resolve();
  lastAutoRefresh = Date.now();
  useLibraryRefresh.setState({ running: true, done: 0, total: 0 });
  current = refreshLibraryChapters({
    onProgress: (done, total) => useLibraryRefresh.setState({ done, total }),
    beforeEach: waitForReaderToClose,
  })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      current = null;
      useLibraryRefresh.setState((state) => ({ running: false, version: state.version + 1 }));
    });
  return current;
}

/** Checks for new chapters when the app returns to the foreground. */
export function useLibraryRefreshOnForeground(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshLibrary(false);
    });
    return () => subscription.remove();
  }, [enabled]);
}
