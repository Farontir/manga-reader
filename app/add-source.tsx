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

import { installSource, previewSource } from '../sources/install';
import type { SourceManifest } from '../sources/types';
import { matchSourceToLibrary } from '../services/librarySources';
import { inspectSourceHealth } from '../sources/api';
import { successFeedback } from '../ui/haptics';
import { setSourceHealth } from '../db';
import { ActionButton } from '../ui/components/ActionButton';
import { Screen } from '../ui/components/Screen';
import { useTheme } from '../ui/useTheme';

export default function AddSourceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { url: initialUrl } = useLocalSearchParams<{ url?: string }>();
  const [url, setUrl] = useState(initialUrl ?? '');
  const [busy, setBusy] = useState(false);
  // Opened from an install link: show what the link points to before anything is installed.
  const [preview, setPreview] = useState<SourceManifest | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    if (!initialUrl) return;
    let active = true;
    previewSource(initialUrl)
      .then((manifest) => {
        if (active) setPreview(manifest);
      })
      .catch((reason: unknown) => {
        if (active) setPreviewError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [initialUrl]);

  async function install() {
    setBusy(true);
    try {
      const source = await installSource(url);
      const health = await inspectSourceHealth(source);
      await setSourceHealth(source.id, health);
      const matched = health !== 'down' ? await matchSourceToLibrary(source) : 0;
      successFeedback();
      Alert.alert('Source installée', `${source.name} est prête. ${matched} manga(s) relié(s).`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (reason) {
      if (__DEV__) console.error('[source] installation', reason);
      Alert.alert(
        'Installation impossible',
        reason instanceof Error ? reason.message : String(reason),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.foreground }]}>Ajouter une source</Text>
        <Text style={[styles.detail, { color: theme.secondary }]}>
          Colle l’URL d’un dépôt de source ou de son manifest.json. Vérifie que tu fais confiance à
          son auteur.
        </Text>
        {initialUrl ? (
          <View
            style={[styles.preview, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            {preview ? (
              <>
                <Text style={[styles.previewName, { color: theme.foreground }]}>
                  {preview.name}
                </Text>
                <Text style={{ color: theme.secondary, marginTop: 4 }}>
                  Version {preview.version} · {preview.language.toUpperCase()}
                </Text>
                <Text style={{ color: theme.secondary, marginTop: 4 }}>
                  Domaines contactés : {preview.allowedHosts.join(', ')}
                </Text>
              </>
            ) : previewError ? (
              <Text style={{ color: theme.danger }}>{previewError}</Text>
            ) : (
              <ActivityIndicator color={theme.accent} />
            )}
          </View>
        ) : null}
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://exemple.org/source/"
          placeholderTextColor={theme.secondary}
          value={url}
          onChangeText={setUrl}
          style={[
            styles.input,
            { color: theme.foreground, backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        />
        <ActionButton
          label="Installer"
          icon="download-outline"
          disabled={busy || !url.trim()}
          onPress={() => {
            void install();
          }}
        />
        {busy ? <ActivityIndicator color={theme.accent} style={{ marginTop: 22 }} /> : null}
        <Text style={[styles.note, { color: theme.secondary }]}>
          L’app vérifie l’empreinte SHA-256 du bundle. Les extensions s’exécutent dans une WebView
          isolée et ne peuvent contacter que les domaines déclarés.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 22 },
  title: { fontSize: 27, fontWeight: '800' },
  detail: { fontSize: 15, lineHeight: 23, marginTop: 10, marginBottom: 24 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    marginBottom: 16,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  note: { fontSize: 12, lineHeight: 19, marginTop: 20 },
  preview: { borderRadius: 12, borderWidth: 1, marginBottom: 16, padding: 14 },
  previewName: { fontSize: 18, fontWeight: '800' },
});
