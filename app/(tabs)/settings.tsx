import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { getSetting } from '../../db';
import { restoreBackup, shareBackup } from '../../services/backup';
import { ActionButton } from '../../ui/components/ActionButton';
import { Screen } from '../../ui/components/Screen';
import { setAccent, setThemeMode, useAppearance } from '../../ui/appearance';
import { setHideSensitive, usePrivacy } from '../../ui/privacy';
import { accents, modes } from '../../ui/theme';
import { useTheme } from '../../ui/useTheme';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const hideSensitive = usePrivacy((state) => state.hideSensitive);
  const mode = useAppearance((state) => state.mode);
  const accent = useAppearance((state) => state.accent);
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
          <Ionicons name="lock-closed-outline" size={25} color={theme.accent} />
          <Text style={[styles.cardTitle, { color: theme.foreground }]}>Confidentialité</Text>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: theme.foreground }]}>
              Masquer le contenu sensible
            </Text>
            {/* Turning it off asks for Face ID; the switch only moves once it succeeds. */}
            <Switch
              value={hideSensitive}
              onValueChange={(value) => {
                void setHideSensitive(value);
              }}
              trackColor={{ true: theme.accent }}
            />
          </View>
        </View>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="moon-outline" size={25} color={theme.accent} />
          <Text style={[styles.cardTitle, { color: theme.foreground }]}>Apparence</Text>
          <Text style={[styles.body, { color: theme.secondary }]}>
            « Système » suit le réglage de ton iPhone ; « Noir » économise la batterie des écrans
            OLED.
          </Text>
          <View style={[styles.segments, { backgroundColor: theme.background }]}>
            {modes.map((item) => {
              const selected = item.id === mode;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    void setThemeMode(item.id);
                  }}
                  // Static style only: NativeWind drops Pressable style callbacks on device.
                  style={[styles.segment, selected ? { backgroundColor: theme.accent } : null]}
                >
                  <Text
                    style={{
                      color: selected ? theme.accentText : theme.foreground,
                      fontSize: 13,
                      fontWeight: '700',
                    }}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.swatchesTitle, { color: theme.foreground }]}>Couleur</Text>
          <View style={styles.swatches}>
            {accents.map((item) => {
              const selected = item.id === accent;
              const color = theme.dark ? item.dark : item.light;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    void setAccent(item.id);
                  }}
                  style={styles.swatchCell}
                >
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: color, borderColor: selected ? theme.foreground : color },
                    ]}
                  >
                    {selected ? (
                      <Ionicons name="checkmark" size={18} color={theme.accentText} />
                    ) : null}
                  </View>
                  <Text style={{ color: theme.secondary, fontSize: 11, marginTop: 4 }}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
  segments: { borderRadius: 12, flexDirection: 'row', marginTop: 14, padding: 3 },
  segment: { alignItems: 'center', borderRadius: 9, flex: 1, paddingVertical: 8 },
  swatchesTitle: { fontSize: 15, fontWeight: '700', marginTop: 18 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  swatchCell: { alignItems: 'center', width: 52 },
  swatch: {
    alignItems: 'center',
    borderRadius: 19,
    borderWidth: 3,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 12 },
  switchLabel: { flex: 1, fontSize: 15 },
});
