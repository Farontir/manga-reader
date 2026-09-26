export type CacheRecord = { size: number; lastUsed: number };

export function leastRecentlyUsedKeys(
  entries: Record<string, CacheRecord>,
  byteLimit: number,
  protectedKeys: ReadonlySet<string> = new Set(),
): string[] {
  let bytes = Object.values(entries).reduce((total, entry) => total + entry.size, 0);
  const oldest = Object.entries(entries)
    .filter(([key]) => !protectedKeys.has(key))
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  const removed: string[] = [];
  for (const [key, entry] of oldest) {
    if (bytes <= byteLimit) break;
    bytes -= entry.size;
    removed.push(key);
  }
  return removed;
}
