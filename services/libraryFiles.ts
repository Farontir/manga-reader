import { Directory, Paths } from 'expo-file-system';

import { deleteLibraryEntry, listLocalChapters } from '../db';

export async function removeEntryAndFiles(entryId: string): Promise<void> {
  const local = await listLocalChapters(entryId);
  await deleteLibraryEntry(entryId);
  const localRoot = new Directory(Paths.document, 'local');
  const localPrefix = `${localRoot.uri.replace(/\/+$/, '')}/`;
  for (const chapter of local) {
    const uri = chapter.pageUris[0];
    if (!uri) continue;
    const separator = uri.lastIndexOf('/');
    const folderUri = uri.slice(0, separator);
    if (!folderUri.startsWith(localPrefix)) continue;
    const directory = new Directory(folderUri);
    if (directory.exists) directory.delete();
  }
  const downloads = new Directory(Paths.document, 'downloads', entryId);
  if (downloads.exists) downloads.delete();
}
