type Save = (chapterNumber: number, startedAt: string, seconds: number) => void;

/**
 * Measures active reading time from the reader's position updates (page turns, scrolling):
 * the time between two updates counts when it is under `idleMs`, so a phone left open on a
 * page does not count. Each chapter's time is saved when the chapter changes, on pause
 * (app in background) and on flush (reader closed).
 */
export function createReadingTimer(save: Save, idleMs = 2 * 60 * 1000) {
  let chapter: number | null = null;
  let startedAt: number | null = null;
  let last: number | null = null;
  let activeMs = 0;

  function flush() {
    if (chapter !== null && startedAt !== null && activeMs >= 1000) {
      save(chapter, new Date(startedAt).toISOString(), Math.round(activeMs / 1000));
    }
    chapter = null;
    startedAt = null;
    last = null;
    activeMs = 0;
  }

  function activity(chapterNumber: number, now = Date.now()) {
    if (chapter !== null && chapter !== chapterNumber) flush();
    if (chapter === null) {
      chapter = chapterNumber;
      startedAt = now;
    } else if (last !== null && now - last <= idleMs) {
      activeMs += now - last;
    }
    last = now;
  }

  /** The app left the foreground: what was read so far is saved, the gap does not count. */
  function pause() {
    flush();
  }

  return { activity, pause, flush };
}
