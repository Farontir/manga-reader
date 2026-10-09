import { listBindings, listLibraryEntries } from '../db';
import { refreshEntryChapters } from './librarySources';

/** Bookmarked manga linked to at least one source, i.e. whose chapter lists can change. */
export async function listRefreshableEntries(): Promise<string[]> {
  const entries = await listLibraryEntries();
  const linked = await Promise.all(
    entries.map(async (entry) => ((await listBindings(entry.id)).length ? entry.id : null)),
  );
  return linked.filter((id): id is string => id !== null);
}

/**
 * Re-reads the chapter lists of every linked bookmarked manga, one manga at a time.
 * `beforeEach` may delay the next manga (e.g. while the reader needs the source sandbox).
 */
export async function refreshLibraryChapters(options: {
  onProgress?: (done: number, total: number) => void;
  beforeEach?: () => Promise<void>;
}): Promise<{ total: number; failed: number }> {
  const ids = await listRefreshableEntries();
  let failed = 0;
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (!id) continue;
    options.onProgress?.(index, ids.length);
    await options.beforeEach?.();
    try {
      await refreshEntryChapters(id);
    } catch {
      failed += 1;
    }
  }
  options.onProgress?.(ids.length, ids.length);
  return { total: ids.length, failed };
}
