import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { countUnreadChapters, listLibraryEntries, type LibraryEntry } from '../../db';
import { libraryCoverSource } from '../../services/appFiles';
import { EmptyState } from '../../ui/components/EmptyState';
import { dismissFolderSyncMessage, pickWatchedFolder, useFolderSync } from '../../ui/folderSync';
import { refreshLibrary, useLibraryRefresh } from '../../ui/libraryRefresh';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/useTheme';

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const sync = useFolderSync();
  const refresh = useLibraryRefresh();
  const [pulling, setPulling] = useState(false);
  const reload = useCallback(() => {
    void Promise.all([
      listLibraryEntries({ includeSensitive: true }),
      countUnreadChapters({ includeSensitive: true }),
    ]).then(([list, counts]) => {
      setEntries(list);
      setUnread(counts);
    });
  }, []);
  useFocusEffect(
    useCallback(() => {
      reload();
      // Opening the library looks for new chapters (throttled to every 15 minutes).
      void refreshLibrary(false);
    }, [reload]),
  );
  useEffect(() => {
    if (sync.libraryVersion || refresh.version) reload();
  }, [sync.libraryVersion, refresh.version, reload]);

  async function pullToRefresh() {
    setPulling(true);
    try {
      await refreshLibrary(true);
    } finally {
      setPulling(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>MANGA READER</Text>
          <Text style={[styles.title, { color: theme.foreground }]}>Bibliothèque</Text>
        </View>
        <Text style={{ color: theme.secondary }}>{entries.length} mangas</Text>
      </View>
      {refresh.running && !pulling && refresh.total ? (
        <Text style={[styles.refreshing, { color: theme.secondary }]}>
          Recherche de nouveaux chapitres… {refresh.done}/{refresh.total}
        </Text>
      ) : null}
      {sync.running || sync.message ? (
        <View
          style={[styles.syncBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          {sync.running ? <ActivityIndicator color={theme.accent} /> : null}
          <Text style={[styles.syncText, { color: theme.foreground }]}>
            {sync.running
              ? `Recherche de nouveaux CBZ${sync.progress ? ` · ${sync.progress}` : '…'}`
              : sync.message}
          </Text>
          {!sync.running && sync.needsAccess ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                pickWatchedFolder().catch((reason: unknown) => {
                  const message = reason instanceof Error ? reason.message : String(reason);
                  if (!message.toLowerCase().includes('cancel'))
                    Alert.alert('Dossier inaccessible', message);
                });
              }}
              style={styles.syncAction}
            >
              <Text style={{ color: theme.accent, fontWeight: '800' }}>Rechoisir</Text>
            </Pressable>
          ) : null}
          {!sync.running && !sync.needsAccess ? (
            <Pressable
              accessibilityLabel="Masquer"
              onPress={dismissFolderSyncMessage}
              style={styles.syncAction}
            >
              <Text style={{ color: theme.secondary, fontSize: 18 }}>×</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <FlashList
        style={styles.listContainer}
        data={entries}
        keyExtractor={(item) => item.id}
        refreshing={pulling}
        onRefresh={() => {
          void pullToRefresh();
        }}
        contentContainerStyle={entries.length ? styles.list : styles.emptyList}
        ListEmptyComponent={
          <EmptyState
            icon="book-outline"
            title="Ta bibliothèque t’attend"
            detail="Ajoute un manga depuis Découvrir ou Recherche. Ta progression restera ici, même si une source disparaît."
          />
        }
        numColumns={3}
        renderItem={({ item }) => (
          // Cover-only grid: the title is read by VoiceOver.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              unread[item.id]
                ? `${item.canonicalTitle}, ${unread[item.id]} chapitre(s) non lu(s)`
                : item.canonicalTitle
            }
            onPress={() => router.push({ pathname: '/entry/[id]', params: { id: item.id } })}
            style={styles.cell}
          >
            {item.coverUrl ? (
              <Image
                source={libraryCoverSource(item.coverUrl)}
                style={[styles.cover, { backgroundColor: theme.surface }]}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : (
              <View style={[styles.cover, styles.placeholder, { backgroundColor: theme.surface }]}>
                <Text
                  numberOfLines={4}
                  style={[styles.placeholderText, { color: theme.secondary }]}
                >
                  {item.canonicalTitle}
                </Text>
              </View>
            )}
            {unread[item.id] ? (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: theme.badge, borderColor: theme.background },
                ]}
              >
                <Text style={styles.badgeText}>
                  {(unread[item.id] ?? 0) > 999 ? '999+' : unread[item.id]}
                </Text>
              </View>
            ) : null}
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 5 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  listContainer: { flex: 1 },
  syncBanner: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  syncText: { flex: 1, fontSize: 13, lineHeight: 18 },
  syncAction: { alignItems: 'center', justifyContent: 'center', minHeight: 32, minWidth: 32 },
  list: { paddingBottom: 24, paddingHorizontal: 14, paddingTop: 14 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  cell: { padding: 6 },
  cover: { aspectRatio: 1 / 1.43, borderRadius: 10, width: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  placeholderText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  refreshing: { fontSize: 12, paddingHorizontal: 20, paddingTop: 6 },
  badge: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 5,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '800' },
});
