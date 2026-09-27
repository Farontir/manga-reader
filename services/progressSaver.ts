type Save = (
  chapterNumber: number,
  pageIndex: number,
  totalPages: number,
  completed: boolean,
) => Promise<void>;

type Position = { chapterNumber: number; pageIndex: number; totalPages: number };

/**
 * Debounced reading-progress writer. Scrolling reports a position many times per second:
 * only the last one is written once it settles, except that leaving a chapter writes its
 * position at once, so a chapter scrolled through is never lost.
 */
export function createProgressSaver(save: Save, delayMs = 400) {
  let pending: Position | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    const position = pending;
    pending = null;
    if (!position) return;
    save(
      position.chapterNumber,
      position.pageIndex,
      position.totalPages,
      position.pageIndex >= position.totalPages - 1,
    ).catch((reason: unknown) => {
      if (__DEV__) console.warn('[reader] progression non enregistrée', reason);
    });
  }

  function record(chapterNumber: number, pageIndex: number, totalPages: number) {
    if (totalPages <= 0) return;
    if (pending && pending.chapterNumber !== chapterNumber) flush();
    pending = { chapterNumber, pageIndex, totalPages };
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  }

  return { record, flush };
}
