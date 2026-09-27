import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getLibraryEntry } from '../db';
import { importLocalChapter } from '../services/localImport';
import { ActionButton } from '../ui/components/ActionButton';
import { Screen } from '../ui/components/Screen';
import { successFeedback } from '../ui/haptics';
import { useTheme } from '../ui/useTheme';

function reportImportError(stage: string, reason: unknown): string {
  if (__DEV__) console.error(`[import] ${stage}`, reason);
  return reason instanceof Error ? reason.message : String(reason);
}

export default function ImportScreen() {
  const { entryId } = useLocalSearchParams<{ entryId?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  useEffect(() => {
    if (entryId)
      void getLibraryEntry(entryId).then((entry) => setTitle(entry?.canonicalTitle ?? ''));
  }, [entryId]);

  async function runImport(kind: 'cbz' | 'folder') {
    setBusy(true);
    try {
      let archive: File | undefined;
      let folder: Directory | undefined;
      if (kind === 'cbz') {
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
          multiple: true,
        });
        if (result.canceled) return;
        const selected = result.assets.filter((asset) => /\.(?:cbz|zip)$/i.test(asset.name));
        if (!selected.length) throw new Error('Sélectionne un ou plusieurs fichiers CBZ.');
        if (selected.length > 1) {
          await importArchives(
            selected.map((asset) => ({ file: new File(asset.uri), name: asset.name })),
          );
          return;
        }
        const asset = selected[0];
        if (!asset) throw new Error('Aucun fichier sélectionné.');
        archive = new File(asset.uri);
        await finishImport(archive, undefined, asset.name);
        return;
      } else {
        folder = await Directory.pickDirectoryAsync();
      }
      await finishImport(archive, folder);
    } catch (reason) {
      Alert.alert('Import impossible', reportImportError(kind, reason));
    } finally {
      setBusy(false);
    }
  }

  async function finishImport(archive?: File, folder?: Directory, fallbackName?: string) {
    const result = await importLocalChapter({
      entryId,
      title: title.trim() || undefined,
      chapterNumber: number.trim() ? Number(number.replace(',', '.')) : undefined,
      archive,
      archiveName: fallbackName,
      folder,
      skipExisting: Boolean(archive && !entryId),
    });
    successFeedback();
    router.replace({ pathname: '/entry/[id]', params: { id: result.entryId } });
  }

  function findArchives(folder: Directory, depth = 0): File[] {
    if (depth > 5) return [];
    const found: File[] = [];
    for (const item of folder.list()) {
      if (item instanceof File && /\.(?:cbz|zip)$/i.test(item.name)) found.push(item);
      if (item instanceof Directory) found.push(...findArchives(item, depth + 1));
      if (found.length > 200)
        throw new Error('Ce dossier contient plus de 200 CBZ. Choisis un sous-dossier.');
    }
    return found.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  async function importArchives(
    archives: { file: File; name: string; folderName?: string; copy?: boolean }[],
  ) {
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (let index = 0; index < archives.length; index += 1) {
      const archive = archives[index];
      if (!archive) continue;
      setImportStatus(`${index + 1} / ${archives.length} · ${archive.name}`);
      const cached = archive.copy
        ? new File(Paths.cache, `manga-import-${Crypto.randomUUID()}.cbz`)
        : null;
      try {
        if (archive.file.size > 120 * 1024 * 1024) {
          throw new Error('CBZ de plus de 120 Mo');
        }
        if (cached) await archive.file.copy(cached);
        const result = await importLocalChapter({
          entryId,
          archive: cached ?? archive.file,
          archiveName: archive.name,
          archiveFolderName: archive.folderName,
          skipExisting: true,
        });
        if (result.imported) imported += 1;
        else skipped += 1;
      } catch (reason) {
        errors.push(`${archive.name} : ${reportImportError('archive', reason)}`);
      } finally {
        if (cached) {
          try {
            if (cached.exists) cached.delete();
          } catch {
            // Cache cleanup must not change the import result.
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    setImportStatus('');
    if (imported) successFeedback();
    Alert.alert(
      'Import terminé',
      `${imported} CBZ importé(s), ${skipped} déjà présent(s), ${errors.length} erreur(s).${errors.length ? `\n\n${errors.slice(0, 3).join('\n')}` : ''}`,
    );
  }

  async function pickArchiveFolder() {
    setBusy(true);
    try {
      const folder = await Directory.pickDirectoryAsync();
      const found = findArchives(folder);
      if (!found.length) throw new Error('Aucun fichier .cbz ou .zip dans ce dossier.');
      await importArchives(
        found.map((file) => ({
          file,
          name: file.name,
          folderName: file.parentDirectory.name,
          copy: true,
        })),
      );
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (!message.toLowerCase().includes('cancelled'))
        Alert.alert('Import impossible', reportImportError('dossier CBZ', reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.foreground }]}>
          Tes fichiers, ta bibliothèque.
        </Text>
        <Text style={[styles.detail, { color: theme.secondary }]}>
          Importe un ou plusieurs CBZ ou un dossier d’images. Les pages sont copiées dans l’app pour
          rester disponibles hors ligne.
        </Text>
        <Text style={[styles.label, { color: theme.foreground }]}>
          Titre du manga (facultatif pour un CBZ)
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          editable={!entryId}
          placeholder="Ex. Mon manga"
          placeholderTextColor={theme.secondary}
          style={[
            styles.input,
            { backgroundColor: theme.surface, borderColor: theme.border, color: theme.foreground },
          ]}
        />
        <Text style={[styles.label, { color: theme.foreground }]}>
          Numéro du chapitre (facultatif pour un CBZ)
        </Text>
        <TextInput
          value={number}
          onChangeText={setNumber}
          keyboardType="decimal-pad"
          placeholder="Détecté automatiquement"
          placeholderTextColor={theme.secondary}
          style={[
            styles.input,
            { backgroundColor: theme.surface, borderColor: theme.border, color: theme.foreground },
          ]}
        />
        <View style={{ height: 24 }} />
        <ActionButton
          label="Choisir un ou plusieurs CBZ"
          icon="document-outline"
          disabled={busy}
          onPress={() => {
            void runImport('cbz');
          }}
        />
        <View style={{ height: 10 }} />
        <Text style={[styles.note, { color: theme.secondary, marginTop: 0, marginBottom: 10 }]}>
          Pour importer automatiquement tous les CBZ d’un dossier, sélectionne ce dossier dans
          Fichiers. Ses sous-dossiers sont aussi parcourus.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Importer tous les CBZ d’un dossier"
          disabled={busy}
          onPress={() => {
            void pickArchiveFolder();
          }}
          style={[
            styles.folderButton,
            { backgroundColor: theme.foreground, opacity: busy ? 0.45 : 1 },
          ]}
        >
          <Text style={[styles.folderButtonText, { color: theme.background }]}>
            Importer tous les CBZ d’un dossier
          </Text>
        </Pressable>
        <View style={{ height: 10 }} />
        <ActionButton
          label="Choisir un dossier d’images"
          icon="folder-outline"
          secondary
          disabled={busy}
          onPress={() => {
            void runImport('folder');
          }}
        />
        {busy ? <ActivityIndicator color={theme.accent} style={{ marginTop: 22 }} /> : null}
        {importStatus ? (
          <Text style={[styles.note, { color: theme.secondary }]}>{importStatus}</Text>
        ) : null}
        <Text style={[styles.note, { color: theme.secondary }]}>
          Les CBZ de plus de 120 Mo doivent être décompressés puis importés comme dossier.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 22 },
  title: { fontSize: 27, fontWeight: '800', lineHeight: 33 },
  detail: { fontSize: 15, lineHeight: 23, marginTop: 10, marginBottom: 25 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 16 },
  input: { borderRadius: 12, borderWidth: 1, fontSize: 16, minHeight: 50, paddingHorizontal: 14 },
  note: { fontSize: 12, lineHeight: 18, marginTop: 20 },
  folderButton: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  folderButtonText: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
});
