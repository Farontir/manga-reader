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
        <View style={[styles.menu, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/sources')}
            style={styles.menuRow}
          >
            <Ionicons name="layers-outline" size={22} color={theme.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuTitle, { color: theme.foreground }]}>Sources</Text>
              <Text style={{ color: theme.secondary, fontSize: 13 }}>
                Installer, mettre à jour, vérifier, désinstaller
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.secondary} />
          </Pressable>
          <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/import')}
            style={styles.menuRow}
          >
            <Ionicons name="folder-open-outline" size={22} color={theme.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuTitle, { color: theme.foreground }]}>Fichiers locaux</Text>
              <Text style={{ color: theme.secondary, fontSize: 13 }}>
                Importer des CBZ ou des dossiers d’images
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.secondary} />
          </Pressable>
        </View>
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
  menu: { borderRadius: 16, borderWidth: 1, marginBottom: 13, overflow: 'hidden' },
  menuRow: { alignItems: 'center', flexDirection: 'row', gap: 14, minHeight: 64, padding: 16 },
  menuTitle: { fontSize: 16, fontWeight: '700' },
  menuDivider: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  cardTitle: { fontSize: 18, fontWeight: '800', marginTop: 12 },
  body: { fontSize: 14, lineHeight: 21, marginTop: 7 },
  footer: { fontSize: 12, marginTop: 18, textAlign: 'center' },
});
