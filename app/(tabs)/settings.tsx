import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getSetting } from '../../db';
import { restoreBackup, shareBackup } from '../../services/backup';
import { ActionButton } from '../../ui/components/ActionButton';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/useTheme';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [repos, setRepos] = useState<string[]>([]);
  const loadRepos = useCallback(async () => {
    const value = await getSetting('restoredSourceRepos');
    if (!value) {
      setRepos([]);
      return;
    }
    try {
      const parsed: unknown = JSON.parse(value);
      setRepos(
        Array.isArray(parsed) ? parsed.filter((url): url is string => typeof url === 'string') : [],
      );
    } catch {
      setRepos([]);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void loadRepos();
      return undefined;
    }, [loadRepos]),
  );

  async function run(action: 'export' | 'import') {
    setBusy(true);
    try {
      if (action === 'export') await shareBackup();
      else {
        const count = await restoreBackup();
        if (count !== null) Alert.alert('Sauvegarde importée', `${count} manga(s) traités.`);
        await loadRepos();
      }
    } catch (reason) {
      Alert.alert(
        'Opération impossible',
        reason instanceof Error ? reason.message : String(reason),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.foreground }]}>Réglages</Text>
        <Text style={[styles.subtitle, { color: theme.secondary }]}>
          Ta progression reste sous ton contrôle.
        </Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="cloud-upload-outline" size={25} color={theme.accent} />
          <Text style={[styles.cardTitle, { color: theme.foreground }]}>Sauvegarde JSON</Text>
          <Text style={[styles.body, { color: theme.secondary }]}>
            Exporte ta bibliothèque, les liaisons et la progression dans Fichiers ou iCloud Drive.
            Les images locales ne sont pas incluses dans le JSON.
          </Text>
          <View style={{ height: 18 }} />
          <ActionButton
            label="Exporter"
            icon="share-outline"
            disabled={busy}
            onPress={() => {
              void run('export');
            }}
          />
          <View style={{ height: 9 }} />
          <ActionButton
            label="Importer"
            icon="download-outline"
            secondary
            disabled={busy}
            onPress={() => {
              void run('import');
            }}
          />
          {busy ? <ActivityIndicator color={theme.accent} style={{ marginTop: 16 }} /> : null}
        </View>
        {repos.length ? (
          <View
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Text style={[styles.cardTitle, { color: theme.foreground, marginTop: 0 }]}>
              Sources de la sauvegarde
            </Text>
            {repos.map((url) => (
              <Pressable
                key={url}
                onPress={() => router.push({ pathname: '/add-source', params: { url } })}
                style={{ paddingVertical: 11 }}
              >
                <Text style={{ color: theme.accent, fontSize: 14 }} numberOfLines={2}>
                  Réinstaller · {url}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="moon-outline" size={25} color={theme.accent} />
          <Text style={[styles.cardTitle, { color: theme.foreground }]}>Apparence</Text>
          <Text style={[styles.body, { color: theme.secondary }]}>
            Le thème clair ou sombre suit les réglages de ton iPhone.
          </Text>
        </View>
        <Text style={[styles.footer, { color: theme.secondary }]}>
          Manga Reader 1.0 · Bibliothèque indépendante des sources
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 45 },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 5, marginBottom: 25 },
  card: { borderRadius: 16, borderWidth: 1, marginBottom: 13, padding: 19 },
  cardTitle: { fontSize: 18, fontWeight: '800', marginTop: 12 },
  body: { fontSize: 14, lineHeight: 21, marginTop: 7 },
  footer: { fontSize: 12, marginTop: 18, textAlign: 'center' },
});
