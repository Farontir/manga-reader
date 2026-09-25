import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { installSource } from '../sources/install';
import { ActionButton } from '../ui/components/ActionButton';
import { Screen } from '../ui/components/Screen';
import { useTheme } from '../ui/useTheme';

export default function AddSourceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function install() {
    setBusy(true);
    try {
      const source = await installSource(url);
      Alert.alert('Source installée', `${source.name} est prête.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (reason) {
      Alert.alert('Installation impossible', reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.foreground }]}>Ajouter une source</Text>
        <Text style={[styles.detail, { color: theme.secondary }]}>
          Colle l’URL d’un dépôt de source ou de son manifest.json. Vérifie que tu fais confiance à son auteur.
        </Text>
        <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url"
          placeholder="https://exemple.org/source/" placeholderTextColor={theme.secondary}
          value={url} onChangeText={setUrl}
          style={[styles.input, { color: theme.foreground, backgroundColor: theme.surface,
            borderColor: theme.border }]} />
        <ActionButton label="Installer" icon="download-outline" disabled={busy || !url.trim()}
          onPress={() => { void install(); }} />
        {busy ? <ActivityIndicator color={theme.accent} style={{ marginTop: 22 }} /> : null}
        <Text style={[styles.note, { color: theme.secondary }]}>
          L’app vérifie l’empreinte SHA-256 du bundle. Les extensions s’exécutent dans une WebView isolée et ne peuvent contacter que les domaines déclarés.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 22 }, title: { fontSize: 27, fontWeight: '800' },
  detail: { fontSize: 15, lineHeight: 23, marginTop: 10, marginBottom: 24 },
  input: { borderRadius: 12, borderWidth: 1, fontSize: 15,
    marginBottom: 16, minHeight: 52, paddingHorizontal: 14 },
  note: { fontSize: 12, lineHeight: 19, marginTop: 20 },
});
