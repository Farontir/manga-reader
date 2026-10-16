type LocalChapterInput = { chapterNumber: number; title: string };
type RemoteChapterInput = {
  number: number;
  title?: string | null;
  sourceId: string;
  chapterId: string;
  publishedAt?: string | null;
};
type BindingInput = { sourceId: string; priority: number; preferred?: boolean };

export type ChapterItem = {
  number: number;
  title: string;
  local: boolean;
  sourceId?: string;
  chapterId?: string;
  publishedAt?: string | null;
};

/**
 * One entry per chapter number, newest first. Local files win over sources. When some
 * sources are preferred, only their chapters are listed; among the listed sources the
 * highest-priority binding provides each chapter.
 */
export function mergeChapters(
  local: LocalChapterInput[],
  remote: RemoteChapterInput[],
  bindings: BindingInput[],
): ChapterItem[] {
  const items: ChapterItem[] = local.map((chapter) => ({
    number: chapter.chapterNumber,
    title: chapter.title,
    local: true,
  }));
  const priorities = new Map(bindings.map((binding) => [binding.sourceId, binding.priority]));
  const preferred = new Set(
    bindings.filter((binding) => binding.preferred).map((binding) => binding.sourceId),
  );
  const listed = preferred.size
    ? remote.filter((chapter) => preferred.has(chapter.sourceId))
    : remote;
  for (const chapter of [...listed].sort(
    (a, b) => (priorities.get(b.sourceId) ?? 0) - (priorities.get(a.sourceId) ?? 0),
  )) {
    if (!items.some((item) => item.number === chapter.number)) {
      items.push({
        number: chapter.number,
        title: chapter.title ?? `Chapitre ${chapter.number}`,
        local: false,
        sourceId: chapter.sourceId,
        chapterId: chapter.chapterId,
        publishedAt: chapter.publishedAt ?? null,
      });
    }
  }
  return items.sort((a, b) => b.number - a.number);
}

/** The chapter that follows `current` (half chapters included), if any is known. */
export function nextChapter(items: ChapterItem[], current: number): ChapterItem | null {
  return items.reduce<ChapterItem | null>(
    (best, item) => (item.number > current && (!best || item.number < best.number) ? item : best),
    null,
  );
}

/** Local titles carry the volume ("Tome 3 · Chapitre 25"); source titles can be long names. */
export function chapterLabel(item: ChapterItem): string {
  return item.local ? item.title : `Chapitre ${item.number}`;
}
