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
  const [number, setNumber] = useState('1');
  const [busy, setBusy] = useState(false);
  const [archiveFiles, setArchiveFiles] = useState<File[]>([]);

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
          type: ['application/zip', 'application/octet-stream', '*/*'],
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        if (!asset) throw new Error('Aucun fichier sélectionné.');
        archive = new File(asset.uri);
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
    const id = await importLocalChapter({
      entryId,
      title: title.trim() || (fallbackName ?? archive?.name)?.replace(/\.(cbz|zip)$/i, '') || '',
      chapterNumber: Number(number),
      archive,
      folder,
    });
    successFeedback();
    router.replace({ pathname: '/entry/[id]', params: { id } });
  }

  async function pickArchiveFolder() {
    setBusy(true);
    try {
      const folder = await Directory.pickDirectoryAsync();
      const found = folder
        .list()
        .filter((item): item is File => item instanceof File && /\.(cbz|zip)$/i.test(item.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (!found.length) throw new Error('Aucun fichier .cbz ou .zip dans ce dossier.');
      setArchiveFiles(found);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (!message.toLowerCase().includes('cancelled'))
        Alert.alert('Dossier inaccessible', reportImportError('dossier CBZ', reason));
    } finally {
      setBusy(false);
    }
  }

  async function importArchiveFromFolder(archive: File) {
    setBusy(true);
    const cached = new File(Paths.cache, `manga-import-${Crypto.randomUUID()}.cbz`);
    try {
      if (archive.size > 120 * 1024 * 1024) {
        throw new Error('CBZ trop volumineux pour cet import. Utilise un dossier d’images.');
      }
      await archive.copy(cached);
      await finishImport(cached, undefined, archive.name);
    } catch (reason) {
      Alert.alert('Import impossible', reportImportError(`archive ${archive.name}`, reason));
    } finally {
      try {
        if (cached.exists) cached.delete();
      } catch {
        // Cache cleanup must not change the import result.
      }
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
          Importe un chapitre CBZ ou un dossier d’images. Les pages sont copiées dans l’app pour
          rester disponibles hors ligne.
        </Text>
        <Text style={[styles.label, { color: theme.foreground }]}>Titre du manga</Text>
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
        <Text style={[styles.label, { color: theme.foreground }]}>Numéro du chapitre</Text>
        <TextInput
          value={number}
          onChangeText={setNumber}
          keyboardType="decimal-pad"
          style={[
            styles.input,
            { backgroundColor: theme.surface, borderColor: theme.border, color: theme.foreground },
          ]}
        />
        <View style={{ height: 24 }} />
        <ActionButton
          label="Choisir un CBZ"
          icon="document-outline"
          disabled={busy}
          onPress={() => {
            void runImport('cbz');
          }}
        />
        <View style={{ height: 10 }} />
        <Text style={[styles.note, { color: theme.secondary, marginTop: 0, marginBottom: 10 }]}>
          Si ton CBZ est grisé dans Fichiers, choisis le dossier qui le contient puis sélectionne-le
          ci-dessous.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choisir le dossier contenant le CBZ"
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
            Choisir le dossier contenant le CBZ
          </Text>
        </Pressable>
        {archiveFiles.map((archive) => (
          <Pressable
            key={archive.uri}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              void importArchiveFromFolder(archive);
            }}
            style={[
              styles.archiveRow,
              { borderColor: theme.border, backgroundColor: theme.surface },
            ]}
          >
            <Text style={{ color: theme.foreground, fontWeight: '700' }}>{archive.name}</Text>
          </Pressable>
        ))}
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
  archiveRow: { borderRadius: 12, borderWidth: 1, marginTop: 8, padding: 14 },
});
