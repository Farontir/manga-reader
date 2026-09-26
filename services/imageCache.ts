import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

import type { ReaderPage } from './readerPages';
import { leastRecentlyUsedKeys, type CacheRecord } from './cachePolicy';

const byteLimit = 256 * 1024 * 1024;
type IndexedImage = CacheRecord & { name: string };
type CacheState = {
  directory: Directory;
  indexFile: File;
  entries: Record<string, IndexedImage>;
};

let opening: Promise<CacheState> | null = null;
let queue: Promise<void> = Promise.resolve();
const downloading = new Map<string, Promise<string>>();

function serialized<T>(work: () => Promise<T> | T): Promise<T> {
  const result = queue.then(work, work);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function validEntries(value: unknown): Record<string, IndexedImage> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries: Record<string, IndexedImage> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[a-f0-9]{64}$/.test(key) || !item || typeof item !== 'object') continue;
    const record = item as Partial<IndexedImage>;
    if (
      typeof record.name !== 'string' ||
      !new RegExp(`^${key}\\.(jpg|jpeg|png|webp|avif|gif)$`).test(record.name) ||
      typeof record.size !== 'number' ||
      !Number.isFinite(record.size) ||
      record.size <= 0 ||
      typeof record.lastUsed !== 'number' ||
      !Number.isFinite(record.lastUsed)
    ) {
      continue;
    }
    entries[key] = { name: record.name, size: record.size, lastUsed: record.lastUsed };
  }
  return entries;
}

async function openCache(): Promise<CacheState> {
  const directory = new Directory(Paths.cache, 'reader-images');
  directory.create({ idempotent: true, intermediates: true });
  const indexFile = new File(directory, 'index.json');
  let entries: Record<string, IndexedImage> = {};
  if (indexFile.exists) {
    try {
      const parsed: unknown = JSON.parse(await indexFile.text());
      if (parsed && typeof parsed === 'object' && 'entries' in parsed) {
        entries = validEntries(parsed.entries);
      }
    } catch {
      // An interrupted index write is recoverable from the cached files.
    }
  }
  const names = new Set(Object.values(entries).map((entry) => entry.name));
  for (const item of directory.list()) {
    if (!(item instanceof File) || item.name === 'index.json') continue;
    if (!names.has(item.name)) item.delete();
  }
  for (const [key, entry] of Object.entries(entries)) {
    const file = new File(directory, entry.name);
    if (!file.exists || file.size < 1) delete entries[key];
  }
  return { directory, indexFile, entries };
}

function state(): Promise<CacheState> {
  if (!opening)
    opening = openCache().catch((error: unknown) => {
      opening = null;
      throw error;
    });
  return opening;
}

function save(cache: CacheState): void {
  cache.indexFile.write(JSON.stringify({ version: 1, entries: cache.entries }));
}

function keyFor(page: ReaderPage): Promise<string> {
  const headers = Object.entries(page.headers ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify([page.uri, headers]),
  );
}

function extension(uri: string, mimeType?: string | null): string {
  const mime = mimeType?.split(';')[0]?.trim().toLowerCase();
  const byMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif',
  };
  if (mime && byMime[mime]) return byMime[mime];
  const path = new URL(uri).pathname;
  return path.match(/\.(jpg|jpeg|png|webp|avif|gif)$/i)?.[1]?.toLowerCase() ?? 'jpg';
}

export async function cachedImageUri(page: ReaderPage): Promise<string | null> {
  if (!page.uri.startsWith('https://')) return null;
  const key = await keyFor(page);
  const cache = await state();
  return serialized(() => {
    const entry = cache.entries[key];
    if (!entry) return null;
    const file = new File(cache.directory, entry.name);
    if (!file.exists || file.size < 1) {
      delete cache.entries[key];
      save(cache);
      return null;
    }
    entry.lastUsed = Date.now();
    save(cache);
    return file.uri;
  });
}

export async function prefetchImage(page: ReaderPage): Promise<string> {
  if (!page.uri.startsWith('https://')) return page.uri;
  const key = await keyFor(page);
  const existing = await cachedImageUri(page);
  if (existing) return existing;
  const active = downloading.get(key);
  if (active) return active;

  const task = (async () => {
    const cache = await state();
    const temporary = new File(cache.directory, `${key}.part`);
    try {
      const result = await LegacyFileSystem.downloadAsync(page.uri, temporary.uri, {
        headers: page.headers,
      });
      if (
        result.status < 200 ||
        result.status >= 300 ||
        !temporary.exists ||
        temporary.size < 1 ||
        result.mimeType?.toLowerCase().startsWith('text/')
      ) {
        throw new Error('Image distante indisponible.');
      }
      if (temporary.size > byteLimit) return page.uri;
      const name = `${key}.${extension(page.uri, result.mimeType)}`;
      const file = new File(cache.directory, name);
      if (file.exists) file.delete();
      temporary.move(file);
      await serialized(() => {
        cache.entries[key] = { name, size: file.size, lastUsed: Date.now() };
        const toRemove = leastRecentlyUsedKeys(cache.entries, byteLimit, new Set([key]));
        for (const oldKey of toRemove) {
          const old = cache.entries[oldKey];
          if (old) {
            const oldFile = new File(cache.directory, old.name);
            if (oldFile.exists) oldFile.delete();
            delete cache.entries[oldKey];
          }
        }
        save(cache);
      });
      return file.uri;
    } finally {
      if (temporary.exists) temporary.delete();
    }
  })();
  downloading.set(key, task);
  try {
    return await task;
  } finally {
    downloading.delete(key);
  }
}
