import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import {
  createLibraryEntry,
  deleteLibraryEntry,
  getLibraryEntry,
  getLocalChapter,
  putLocalChapter,
  updateLibraryEntry,
} from '../db';
import { extractCbzPages } from './cbzStream';
import { isImagePath } from './pageFiles';

type ImportInput = {
  entryId?: string;
  title: string;
  chapterNumber: number;
  archive?: File;
  folder?: Directory;
};

async function* archiveChunks(file: File): AsyncIterable<Uint8Array> {
  const handle = file.open();
  try {
    let remaining = file.size;
    let count = 0;
    while (remaining > 0) {
      const chunk = handle.readBytes(Math.min(256 * 1024, remaining));
      if (!chunk.length) throw new Error('CBZ incomplet.');
      remaining -= chunk.length;
      yield chunk;
      count += 1;
      if (count % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    handle.close();
  }
}

export async function importLocalChapter(input: ImportInput): Promise<string> {
  if (!Number.isFinite(input.chapterNumber) || input.chapterNumber < 0) {
    throw new Error('Numéro de chapitre invalide.');
  }
  if (!input.entryId && !input.title.trim()) throw new Error('Donne un titre au manga.');
  if (!input.archive && !input.folder) throw new Error('Choisis un CBZ ou un dossier.');
  if (input.entryId && !(await getLibraryEntry(input.entryId)))
    throw new Error('Manga introuvable.');

  const target = new Directory(Paths.document, 'local', Crypto.randomUUID());
  target.create({ intermediates: true });
  const pageUris: string[] = [];
  let createdEntryId: string | null = null;
  let chapterSaved = false;
  const previous = input.entryId ? await getLocalChapter(input.entryId, input.chapterNumber) : null;
  try {
    if (input.archive) {
      const archive = input.archive;
      if (archive.size > 120 * 1024 * 1024) {
        throw new Error('CBZ trop volumineux pour cet import. Utilise un dossier d’images.');
      }
      const extracted = await extractCbzPages(archiveChunks(archive), (index, name) => {
        const extension = name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const file = new File(target, `temp-${String(index + 1).padStart(5, '0')}.${extension}`);
        file.create();
        const handle = file.open();
        return {
          value: file,
          write: (chunk: Uint8Array) => handle.writeBytes(chunk),
          close: () => handle.close(),
        };
      });
      if (!extracted.length) throw new Error('Aucune image trouvée dans le CBZ.');
      for (let index = 0; index < extracted.length; index += 1) {
        const page = extracted[index];
        if (!page) continue;
        const extension = page.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const destination = new File(target, `${String(index + 1).padStart(5, '0')}.${extension}`);
        page.value.move(destination);
        pageUris.push(destination.uri);
      }
    } else if (input.folder) {
      const pages = input.folder
        .list()
        .filter((item): item is File => item instanceof File && isImagePath(item.name))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
        );
      if (!pages.length) throw new Error('Aucune image trouvée dans le dossier.');
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        if (!page) continue;
        const extension = page.extension.replace('.', '').toLowerCase() || 'jpg';
        const destination = new File(target, `${String(index + 1).padStart(5, '0')}.${extension}`);
        page.copy(destination);
        pageUris.push(destination.uri);
      }
    }
    if (!pageUris.length) throw new Error('Aucune page exploitable.');
    if (!input.entryId) {
      createdEntryId = (
        await createLibraryEntry({
          canonicalTitle: input.title,
          coverUrl: pageUris[0],
        })
      ).id;
    }
    const entryId = input.entryId ?? createdEntryId;
    if (!entryId) throw new Error('Import impossible.');
    await putLocalChapter({
      libraryEntryId: entryId,
      chapterNumber: input.chapterNumber,
      title: `Chapitre ${input.chapterNumber}`,
      archiveUri: null,
      pageUris,
      importedAt: new Date().toISOString(),
    });
    chapterSaved = true;
    const entry = await getLibraryEntry(entryId);
    if (entry && (!entry.coverUrl || entry.coverUrl === previous?.pageUris[0])) {
      await updateLibraryEntry(entryId, { coverUrl: pageUris[0] });
    }
    const previousPage = previous?.pageUris[0];
    if (previousPage) {
      const previousFolder = previousPage.slice(0, previousPage.lastIndexOf('/'));
      const localRoot = new Directory(Paths.document, 'local');
      if (previousFolder.startsWith(`${localRoot.uri.replace(/\/+$/, '')}/`)) {
        const oldDirectory = new Directory(previousFolder);
        try {
          if (oldDirectory.exists) oldDirectory.delete();
        } catch {
          // The new chapter is already stored; old-file cleanup is best effort.
        }
      }
    }
    return entryId;
  } catch (error) {
    if (createdEntryId) await deleteLibraryEntry(createdEntryId);
    if (target.exists && (!chapterSaved || createdEntryId)) target.delete();
    throw error;
  }
}
