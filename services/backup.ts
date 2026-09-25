import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { exportBackup, importBackup, parseBackup, setSetting } from '../db';

export async function shareBackup(): Promise<void> {
  const snapshot = await exportBackup();
  const date = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `manga-reader-${date}.json`);
  file.write(JSON.stringify(snapshot, null, 2));
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Partage indisponible sur cet appareil.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Sauvegarder Manga Reader',
    UTI: 'public.json',
  });
}

export async function restoreBackup(): Promise<number | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]) return null;
  const file = new File(result.assets[0].uri);
  if (file.size > 10 * 1024 * 1024) throw new Error('Sauvegarde trop volumineuse.');
  const text = await file.text();
  const snapshot = parseBackup(JSON.parse(text) as unknown);
  const count = await importBackup(snapshot);
  await setSetting('restoredSourceRepos', JSON.stringify(snapshot.sourceRepos));
  return count;
}
