import * as Crypto from 'expo-crypto';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { unzipSync } from 'fflate';

import { createLibraryEntry, getLibraryEntry, putLocalChapter, updateLibraryEntry } from '../db';
import { isImagePath, sortPagePaths } from './pageFiles';

type ImportInput = {
  entryId?: string;
  title: string;
  chapterNumber: number;
  asset?: DocumentPickerAsset;
  folder?: Directory;
};

export async function importLocalChapter(input: ImportInput): Promise<string> {
  if (!Number.isFinite(input.chapterNumber) || input.chapterNumber < 0) {
    throw new Error('Numéro de chapitre invalide.');
  }
  if (!input.entryId && !input.title.trim()) throw new Error('Donne un titre au manga.');
  if (!input.asset && !input.folder) throw new Error('Choisis un CBZ ou un dossier.');
  if (input.entryId && !(await getLibraryEntry(input.entryId))) throw new Error('Manga introuvable.');

  const target = new Directory(Paths.document, 'local', Crypto.randomUUID());
  target.create({ intermediates: true });
  let pageUris: string[] = [];
  try {
    if (input.asset) {
      if (input.asset.size && input.asset.size > 120 * 1024 * 1024) {
        throw new Error('CBZ trop volumineux pour cet import. Utilise un dossier d’images.');
      }
      const archive = await new File(input.asset.uri).bytes();
      const extracted = unzipSync(archive, { filter: (file) => isImagePath(file.name) });
      const names = sortPagePaths(Object.keys(extracted));
      if (!names.length) throw new Error('Aucune image trouvée dans le CBZ.');
      for (let index = 0; index < names.length; index += 1) {
        const name = names[index];
        if (!name) continue;
        const data = extracted[name];
        if (!data) continue;
        const extension = name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const file = new File(target, `${String(index + 1).padStart(5, '0')}.${extension}`);
        file.write(data);
        pageUris.push(file.uri);
      }
    } else if (input.folder) {
      const pages = input.folder.list().filter((item): item is File =>
        item instanceof File && isImagePath(item.name),
      ).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
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
    const entryId = input.entryId ?? (await createLibraryEntry({
      canonicalTitle: input.title, coverUrl: pageUris[0],
    })).id;
    await putLocalChapter({
      libraryEntryId: entryId, chapterNumber: input.chapterNumber,
      title: `Chapitre ${input.chapterNumber}`, archiveUri: null,
      pageUris, importedAt: new Date().toISOString(),
    });
    const entry = await getLibraryEntry(entryId);
    if (entry && !entry.coverUrl) await updateLibraryEntry(entryId, { coverUrl: pageUris[0] });
    return entryId;
  } catch (error) {
    target.delete();
    throw error;
  }
}
