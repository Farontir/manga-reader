import { Directory, File, Paths } from 'expo-file-system';

import { putDownloadedChapter } from '../db';
import { resolveChapterPages } from './readerPages';

function extensionFor(url: string): string {
  const match = new URL(url).pathname.match(/\.(jpg|jpeg|png|webp|avif)$/i);
  return match?.[1]?.toLowerCase() ?? 'jpg';
}

export async function downloadChapter(
  entryId: string,
  chapterNumber: number,
  sourceId: string,
  chapterId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const pages = await resolveChapterPages(entryId, chapterNumber, sourceId, chapterId);
  if (!pages.every((page) => page.uri.startsWith('https://'))) {
    throw new Error('Ce chapitre est déjà local.');
  }
  const directory = new Directory(Paths.document, 'downloads', entryId, String(chapterNumber));
  directory.create({ idempotent: true, intermediates: true });
  const uris: string[] = [];
  let totalSize = 0;
  try {
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      if (!page) continue;
      const target = new File(
        directory,
        `${String(index + 1).padStart(5, '0')}.${extensionFor(page.uri)}`,
      );
      const file = await File.downloadFileAsync(page.uri, target, {
        idempotent: true,
        headers: page.headers,
      });
      uris.push(file.uri);
      totalSize += file.size;
      onProgress?.(index + 1, pages.length);
    }
    await putDownloadedChapter({
      libraryEntryId: entryId,
      chapterNumber,
      sourceId,
      pageUris: uris,
      downloadedAt: new Date().toISOString(),
      sizeBytes: totalSize,
    });
  } catch (error) {
    if (directory.exists) directory.delete();
    throw error;
  }
}
