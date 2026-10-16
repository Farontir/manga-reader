import { getDatabase } from '../connection';
import { HIDE_FROM_HISTORY_SQL, historySql } from './historySql';

export type HistoryItem = {
  entryId: string;
  /** The chapter of this manga opened most recently. */
  chapterNumber: number;
  pageIndex: number;
  totalPages: number | null;
  readAt: string;
  completed: boolean;
  title: string;
  coverUrl: string | null;
  /** The next known chapter, to continue with once this one is finished. */
  nextChapter: number | null;
};

type HistoryRow = Omit<HistoryItem, 'completed'> & { completed: number };

/** One line per manga, the most recently read first. */
export async function listHistory(options: {
  includeSensitive: boolean;
  limit?: number;
}): Promise<HistoryItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<HistoryRow>(
    historySql(options.includeSensitive),
    options.limit ?? 200,
  );
  return rows.map((row) => ({ ...row, completed: row.completed === 1 }));
}

/** Removes a manga from the history until it is read again. */
export async function hideFromHistory(entryId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(HIDE_FROM_HISTORY_SQL, new Date().toISOString(), entryId);
}
