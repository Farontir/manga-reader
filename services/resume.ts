type ProgressRecord = {
  chapterNumber: number;
  pageIndex: number;
  readAt: string;
  completed: boolean;
};

export type ResumeTarget =
  /** Last chapter opened, not finished: reopen it at its saved page. */
  | { kind: 'resume'; chapterNumber: number; pageIndex: number }
  /** Last chapter opened is finished: open the following one. */
  | { kind: 'next'; chapterNumber: number }
  /** Nothing read yet: open the first chapter. */
  | { kind: 'start'; chapterNumber: number }
  /** Last chapter opened is finished and no later chapter is known. */
  | { kind: 'upToDate'; chapterNumber: number };

/** Where "Reprendre" leads, from the known chapter numbers and the reading progress. */
export function resumeTarget(
  chapterNumbers: number[],
  progress: ProgressRecord[],
): ResumeTarget | null {
  const numbers = [...new Set(chapterNumbers)].sort((a, b) => a - b);
  const first = numbers[0];
  if (first === undefined) return null;
  // ISO timestamps sort chronologically as strings.
  const latest = progress.reduce<ProgressRecord | undefined>(
    (current, record) => (!current || record.readAt > current.readAt ? record : current),
    undefined,
  );
  if (!latest) return { kind: 'start', chapterNumber: first };
  if (!latest.completed) {
    return { kind: 'resume', chapterNumber: latest.chapterNumber, pageIndex: latest.pageIndex };
  }
  const next = numbers.find((number) => number > latest.chapterNumber);
  return next === undefined
    ? { kind: 'upToDate', chapterNumber: latest.chapterNumber }
    : { kind: 'next', chapterNumber: next };
}
