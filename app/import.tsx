import * as DocumentPicker from 'expo-document-picker';
import { Directory } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useTheme } from '../ui/useTheme';

export default function ImportScreen() {
  const { entryId } = useLocalSearchParams<{ entryId?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [number, setNumber] = useState('1');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (entryId)
      void getLibraryEntry(entryId).then((entry) => setTitle(entry?.canonicalTitle ?? ''));
  }, [entryId]);

  async function runImport(kind: 'cbz' | 'folder') {
    setBusy(true);
    try {
      let asset: DocumentPicker.DocumentPickerAsset | undefined;
      let folder: Directory | undefined;
      if (kind === 'cbz') {
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        asset = result.assets[0];
      } else {
        const picked = await Directory.pickDirectoryAsync();
        folder = new Directory(picked.uri);
      }
      const id = await importLocalChapter({
        entryId,
        title,
        chapterNumber: Number(number),
        asset,
        folder,
      });
      router.replace({ pathname: '/entry/[id]', params: { id } });
    } catch (reason) {
      Alert.alert('Import impossible', reason instanceof Error ? reason.message : String(reason));
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
});
