import { getDatabase } from '../connection';
import {
  ADD_READING_TIME_SQL,
  CHAPTERS_READ_SQL,
  chaptersPerMangaSql,
  MANGA_COMPLETED_SQL,
  READING_DAYS_SQL,
  READING_TIME_SQL,
} from './statsSql';

export async function addReadingTime(
  entryId: string,
  chapterNumber: number,
  startedAt: string,
  seconds: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(ADD_READING_TIME_SQL, entryId, chapterNumber, startedAt, seconds);
}

export type ProfileStats = {
  totalSeconds: number;
  recentSeconds: number;
  chaptersRead: number;
  mangaCompleted: number;
  readingDays: string[];
  /** Genres of each manga read, with its number of chapters read. */
  manga: { genres: string[]; chaptersRead: number }[];
};

function genresOf(detailsJson: string | null): string[] {
  try {
    const parsed: unknown = detailsJson ? JSON.parse(detailsJson) : null;
    const genres =
      parsed && typeof parsed === 'object' ? (parsed as { genres?: unknown }).genres : [];
    return Array.isArray(genres)
      ? genres.filter((genre): genre is string => typeof genre === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Everything the profile shows; `recentSince` bounds the "this week" reading time. */
export async function getProfileStats(options: {
  includeSensitive: boolean;
  recentSince: string;
}): Promise<ProfileStats> {
  const db = await getDatabase();
  const [time, chapters, completed, days, perManga] = await Promise.all([
    db.getFirstAsync<{ total: number; recent: number }>(READING_TIME_SQL, options.recentSince),
    db.getFirstAsync<{ count: number }>(CHAPTERS_READ_SQL),
    db.getFirstAsync<{ count: number }>(MANGA_COMPLETED_SQL),
    db.getAllAsync<{ day: string }>(READING_DAYS_SQL),
    db.getAllAsync<{ detailsJson: string | null; chapters: number }>(
      chaptersPerMangaSql(options.includeSensitive),
    ),
  ]);
  return {
    totalSeconds: time?.total ?? 0,
    recentSeconds: time?.recent ?? 0,
    chaptersRead: chapters?.count ?? 0,
    mangaCompleted: completed?.count ?? 0,
    readingDays: days.map((row) => row.day),
    manga: perManga.map((row) => ({
      genres: genresOf(row.detailsJson),
      chaptersRead: row.chapters,
    })),
  };
}
