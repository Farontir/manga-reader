import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { listInstalledSources, setSourceHealth, type InstalledSource } from '../../db';
import { checkSourceHealth } from '../../sources/api';
import { uninstallSource } from '../../sources/install';
import { ActionButton } from '../../ui/components/ActionButton';
import { EmptyState } from '../../ui/components/EmptyState';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/useTheme';

export default function SourcesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [sources, setSources] = useState<InstalledSource[]>([]);
  const [checking, setChecking] = useState(false);
  const reload = useCallback(() => {
    void listInstalledSources().then(setSources);
  }, []);
  useFocusEffect(reload);

  async function checkAll() {
    setChecking(true);
    try {
      for (const source of sources) {
        const healthy = await checkSourceHealth(source);
        await setSourceHealth(source.id, healthy ? 'ok' : 'down');
      }
      reload();
    } finally {
      setChecking(false);
    }
  }

  function confirmRemove(source: InstalledSource) {
    Alert.alert(
      `Désinstaller ${source.name} ?`,
      'Le manga, les chapitres connus et ta progression resteront dans la bibliothèque.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Désinstaller',
          style: 'destructive',
          onPress: () => {
            void uninstallSource(source)
              .then(reload)
              .catch((reason: unknown) =>
                Alert.alert('Erreur', reason instanceof Error ? reason.message : String(reason)),
              );
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground }]}>Sources</Text>
        <Text style={[styles.subtitle, { color: theme.secondary }]}>
          Installe tes extensions depuis une URL HTTPS. Ta bibliothèque reste indépendante de leurs
          serveurs.
        </Text>
        <View style={{ marginTop: 22 }}>
          <ActionButton
            label="Installer une source"
            icon="add"
            onPress={() => router.push('/add-source')}
          />
        </View>
        {sources.length ? (
          <Pressable
            onPress={() => {
              void checkAll();
            }}
            disabled={checking}
            style={styles.check}
          >
            {checking ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <Ionicons name="pulse-outline" size={18} color={theme.accent} />
            )}
            <Text style={{ color: theme.accent, fontWeight: '700' }}>Vérifier les sources</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={sources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={sources.length ? styles.list : styles.emptyList}
        ListEmptyComponent={
          <EmptyState
            icon="layers-outline"
            title="Aucune source installée"
            detail="Tu peux déjà lire tes fichiers locaux. Ajoute une source pour rechercher et lire des chapitres en ligne."
          />
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.foreground, fontWeight: '800', fontSize: 16 }}>
                {item.name}
              </Text>
              <Text style={{ color: theme.secondary, marginTop: 4 }}>
                {item.language.toUpperCase()} · v{item.version}
              </Text>
              <Text
                style={{
                  color:
                    item.healthStatus === 'ok'
                      ? theme.success
                      : item.healthStatus === 'down'
                        ? theme.danger
                        : theme.secondary,
                  marginTop: 7,
                }}
              >
                {item.healthStatus === 'ok'
                  ? '● Opérationnelle'
                  : item.healthStatus === 'down'
                    ? '● Indisponible'
                    : '● Non vérifiée'}
              </Text>
            </View>
            <Pressable
              onPress={() => confirmRemove(item)}
              accessibilityLabel={`Désinstaller ${item.name}`}
              style={styles.remove}
            >
              <Ionicons name="trash-outline" size={20} color={theme.danger} />
            </Pressable>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 20 },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 5 },
  check: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 17, padding: 5 },
  list: { gap: 10, padding: 20 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  row: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 16,
  },
  remove: { alignItems: 'center', justifyContent: 'center', height: 44, width: 44 },
});
