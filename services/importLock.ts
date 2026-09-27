let queue: Promise<unknown> = Promise.resolve();

/** Runs imports one at a time so manual and automatic imports never race on a chapter. */
export function withImportLock<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}
