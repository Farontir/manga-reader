/** XP for a chapter finished (opened in the reader, not just marked) and a manga completed. */
export const XP_PER_CHAPTER = 10;
export const XP_PER_MANGA = 50;

export const RANKS: { name: string; xp: number }[] = [
  { name: 'Novice', xp: 0 },
  { name: 'Apprenti', xp: 100 },
  { name: 'Lecteur', xp: 300 },
  { name: 'Lecteur assidu', xp: 700 },
  { name: 'Bibliophile', xp: 1500 },
  { name: 'Érudit', xp: 3000 },
  { name: 'Sensei', xp: 5500 },
  { name: 'Maître', xp: 9000 },
  { name: 'Grand maître', xp: 14000 },
  { name: 'Légende', xp: 20000 },
];

export function totalXp(chaptersRead: number, mangaCompleted: number): number {
  return chaptersRead * XP_PER_CHAPTER + mangaCompleted * XP_PER_MANGA;
}

export type RankProgress = {
  rank: string;
  /** 1 for Novice … 10 for Légende. */
  level: number;
  next: string | null;
  /** XP still needed for the next rank, 0 at the top. */
  remaining: number;
  /** Progress towards the next rank, 0 to 1 (1 at the top). */
  progress: number;
};

export function rankFor(xp: number): RankProgress {
  let index = 0;
  RANKS.forEach((rank, position) => {
    if (xp >= rank.xp) index = position;
  });
  const current = RANKS[index] as { name: string; xp: number };
  const next = RANKS[index + 1];
  if (!next) return { rank: current.name, level: index + 1, next: null, remaining: 0, progress: 1 };
  return {
    rank: current.name,
    level: index + 1,
    next: next.name,
    remaining: next.xp - xp,
    progress: (xp - current.xp) / (next.xp - current.xp),
  };
}

/** Consecutive reading days ending today (or yesterday, if nothing was read yet today). */
export function readingStreak(days: string[], today: string): number {
  const read = new Set(days);
  const date = new Date(`${today}T12:00:00Z`);
  const iso = () => date.toISOString().slice(0, 10);
  if (!read.has(iso())) date.setUTCDate(date.getUTCDate() - 1);
  let streak = 0;
  while (read.has(iso())) {
    streak += 1;
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return streak;
}

/** "3 h 25 min", "45 min", "0 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
}

/** Genres weighted by the chapters read in each manga, most read first. */
export function topGenres(
  manga: { genres: string[]; chaptersRead: number }[],
  limit = 5,
): { genre: string; chapters: number }[] {
  const totals = new Map<string, number>();
  for (const item of manga) {
    for (const genre of item.genres) {
      totals.set(genre, (totals.get(genre) ?? 0) + item.chaptersRead);
    }
  }
  return [...totals]
    .filter(([, chapters]) => chapters > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([genre, chapters]) => ({ genre, chapters }));
}
