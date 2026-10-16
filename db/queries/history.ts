import { getDatabase } from '../connection';
import { HIDE_FROM_HISTORY_SQL, historySql } from './historySql';

export type HistoryItem = {
  entryId: string;
  chapterNumber: number;
  pageIndex: number;
  totalPages: number | null;
  readAt: string;
  completed: boolean;
  title: string;
  coverUrl: string | null;
};

type HistoryRow = Omit<HistoryItem, 'completed'> & { completed: number };

/** Chapters opened most recently, newest first. */
export async function listHistory(options: {
  includeSensitive: boolean;
  limit?: number;
}): Promise<HistoryItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<HistoryRow>(
    historySql(options.includeSensitive),
    options.limit ?? 300,
  );
  return rows.map((row) => ({ ...row, completed: row.completed === 1 }));
}

export async function hideFromHistory(entryId: string, chapterNumber: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(HIDE_FROM_HISTORY_SQL, entryId, chapterNumber);
}
