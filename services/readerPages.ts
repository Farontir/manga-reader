import {
  getDownloadedChapter,
  getInstalledSource,
  getLocalChapter,
  listBindings,
  listKnownChapters,
  markBindingHealth,
  setBindingPriority,
} from '../db';
import { getSourcePages } from '../sources/api';

export type ReaderPage = { uri: string; headers?: Record<string, string> };

export async function resolveChapterPages(
  entryId: string,
  chapterNumber: number,
  preferredSourceId?: string,
  preferredChapterId?: string,
): Promise<ReaderPage[]> {
  const local = await getLocalChapter(entryId, chapterNumber);
  if (local?.pageUris.length) return local.pageUris.map((uri) => ({ uri }));
  const download = await getDownloadedChapter(entryId, chapterNumber);
  if (download?.pageUris.length) return download.pageUris.map((uri) => ({ uri }));
  const [bindings, chapters] = await Promise.all([
    listBindings(entryId),
    listKnownChapters(entryId),
  ]);
  const candidates = chapters.filter((chapter) => chapter.number === chapterNumber);
  if (
    preferredSourceId &&
    preferredChapterId &&
    !candidates.some(
      (chapter) =>
        chapter.sourceId === preferredSourceId && chapter.chapterId === preferredChapterId,
    )
  ) {
    candidates.unshift({
      libraryEntryId: entryId,
      sourceId: preferredSourceId,
      chapterId: preferredChapterId,
      number: chapterNumber,
      title: null,
      language: null,
      publishedAt: null,
      fetchedAt: new Date().toISOString(),
    });
  }
  candidates.sort((a, b) => {
    if (a.sourceId === preferredSourceId && b.sourceId !== preferredSourceId) return -1;
    if (b.sourceId === preferredSourceId && a.sourceId !== preferredSourceId) return 1;
    return (
      (bindings.find((item) => item.sourceId === b.sourceId)?.priority ?? 0) -
      (bindings.find((item) => item.sourceId === a.sourceId)?.priority ?? 0)
    );
  });
  for (const candidate of candidates) {
    const source = await getInstalledSource(candidate.sourceId);
    if (!source) continue;
    const binding = bindings.find((item) => item.sourceId === source.id);
    try {
      const pages = await getSourcePages(source, candidate.chapterId);
      if (binding) await markBindingHealth(binding.id, null);
      if (binding && preferredSourceId && candidate.sourceId !== preferredSourceId) {
        await setBindingPriority(
          binding.id,
          Math.max(...bindings.map((item) => item.priority), 0) + 1,
        );
      }
      return pages.map((page) => ({ uri: page.url, headers: page.headers }));
    } catch (reason) {
      if (binding)
        await markBindingHealth(
          binding.id,
          reason instanceof Error ? reason.message : String(reason),
        );
    }
  }
  throw new Error('Pages indisponibles. Vérifie tes sources ou tes téléchargements.');
}
