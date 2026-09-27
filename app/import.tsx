import * as DocumentPicker from 'expo-document-picker';
import { Directory, File } from 'expo-file-system';
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
import {
  findArchives,
  importArchives,
  type ArchiveCandidate,
  type ArchiveImportSummary,
} from '../services/folderSync';
import { withImportLock } from '../services/importLock';
import { importLocalChapter } from '../services/localImport';
import { ActionButton } from '../ui/components/ActionButton';
import { Screen } from '../ui/components/Screen';
import {
  describeSync,
  pickWatchedFolder,
  stopWatchingFolder,
  useFolderSync,
} from '../ui/folderSync';
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
  const sync = useFolderSync();

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
          await importIntoEntry(
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
    const result = await withImportLock(() =>
      importLocalChapter({
        entryId,
        title: title.trim() || undefined,
        chapterNumber: number.trim() ? Number(number.replace(',', '.')) : undefined,
        archive,
        archiveName: fallbackName,
        folder,
        skipExisting: Boolean(archive && !entryId),
      }),
    );
    successFeedback();
    router.replace({ pathname: '/entry/[id]', params: { id: result.entryId } });
  }

  function showSummary(summary: ArchiveImportSummary, extra?: string | null) {
    if (summary.imported) successFeedback();
    const lines = [
      `${summary.imported} CBZ importé(s), ${summary.skipped} déjà présent(s), ${summary.errors.length} erreur(s).`,
      extra,
      summary.errors.slice(0, 3).join('\n'),
    ];
    Alert.alert('Import terminé', lines.filter(Boolean).join('\n\n'));
  }

  async function importIntoEntry(archives: ArchiveCandidate[]) {
    const summary = await withImportLock(() =>
      importArchives(archives, {
        entryId,
        onProgress: (index, total, name) => setImportStatus(`${index + 1} / ${total} · ${name}`),
      }),
    );
    setImportStatus('');
    showSummary(summary);
  }

  async function pickArchiveFolder() {
    setBusy(true);
    try {
      if (entryId) {
        // Adding chapters to one manga: one-shot import, the folder is not watched.
        const folder = await Directory.pickDirectoryAsync();
        const { archives } = findArchives(folder);
        if (!archives.length) throw new Error('Aucun fichier .cbz ou .zip dans ce dossier.');
        await importIntoEntry(
          archives.map((file) => ({
            file,
            name: file.name,
            folderName: file.parentDirectory.name,
            copy: true,
          })),
        );
        return;
      }
      const result = await pickWatchedFolder();
      if (result?.status === 'no-access') throw new Error('Impossible de lire ce dossier.');
      if (result?.status === 'done') {
        if (!result.summary.imported && !result.summary.skipped && !result.summary.errors.length)
          Alert.alert('Dossier surveillé', 'Aucun nouveau CBZ pour le moment.');
        else showSummary(result.summary, describeSync(result));
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (!message.toLowerCase().includes('cancel'))
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
          {entryId
            ? 'Importe dans ce manga tous les CBZ d’un dossier et de ses sous-dossiers.'
            : 'Choisis le dossier où tu ranges tes CBZ (sous-dossiers compris). Il est rescanné à chaque ouverture de l’app et seuls les nouveaux fichiers sont importés. Tes fichiers ne sont jamais modifiés.'}
        </Text>
        {!entryId && sync.watchedFolderName ? (
          <View
            style={[styles.watched, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Text style={[styles.watchedText, { color: theme.foreground }]} numberOfLines={2}>
              Dossier surveillé : « {sync.watchedFolderName} »
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy || sync.running}
              onPress={() => {
                void stopWatchingFolder();
              }}
              style={styles.watchedAction}
            >
              <Text style={{ color: theme.accent, fontWeight: '700' }}>Ne plus surveiller</Text>
            </Pressable>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            entryId ? 'Importer tous les CBZ d’un dossier' : 'Surveiller un dossier de CBZ'
          }
          disabled={busy || sync.running}
          onPress={() => {
            void pickArchiveFolder();
          }}
          style={[
            styles.folderButton,
            { backgroundColor: theme.foreground, opacity: busy || sync.running ? 0.45 : 1 },
          ]}
        >
          <Text style={[styles.folderButtonText, { color: theme.background }]}>
            {entryId
              ? 'Importer tous les CBZ d’un dossier'
              : sync.watchedFolderName
                ? 'Changer de dossier surveillé'
                : 'Surveiller un dossier de CBZ'}
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
        {importStatus || sync.progress ? (
          <Text style={[styles.note, { color: theme.secondary }]}>
            {importStatus || sync.progress}
          </Text>
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
  watched: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    padding: 12,
  },
  watchedText: { flex: 1, fontSize: 13, lineHeight: 18 },
  watchedAction: { justifyContent: 'center', minHeight: 32 },
});
