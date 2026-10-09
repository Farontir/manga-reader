import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { countUnreadChapters, listLibraryEntries, type LibraryEntry } from '../../db';
import { coverImageSource } from '../../services/coverImage';
import { EmptyState } from '../../ui/components/EmptyState';
import { dismissFolderSyncMessage, pickWatchedFolder, useFolderSync } from '../../ui/folderSync';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/useTheme';

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const sync = useFolderSync();
  const reload = useCallback(() => {
    void Promise.all([listLibraryEntries(), countUnreadChapters()]).then(([list, counts]) => {
      setEntries(list);
      setUnread(counts);
    });
  }, []);
  useFocusEffect(reload);
  useEffect(() => {
    if (sync.libraryVersion) reload();
  }, [sync.libraryVersion, reload]);

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>MANGA READER</Text>
          <Text style={[styles.title, { color: theme.foreground }]}>Bibliothèque</Text>
        </View>
        <Text style={{ color: theme.secondary }}>{entries.length} mangas</Text>
      </View>
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
        contentContainerStyle={entries.length ? styles.list : styles.emptyList}
        ListEmptyComponent={
          <EmptyState
            icon="book-outline"
            title="Ta bibliothèque t’attend"
            detail="Ajoute un manga depuis Découvrir ou Recherche. Ta progression restera ici, même si une source disparaît."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/entry/[id]', params: { id: item.id } })}
            style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <View>
              {item.coverUrl ? (
                <Image
                  source={coverImageSource(item.coverUrl)}
                  style={styles.cover}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <View style={[styles.cover, { backgroundColor: theme.border }]}>
                  <Text style={{ color: theme.secondary, fontSize: 25 }}>✦</Text>
                </View>
              )}
              {unread[item.id] ? (
                <View
                  accessibilityLabel={`${unread[item.id]} chapitre(s) non lu(s)`}
                  style={[
                    styles.badge,
                    { backgroundColor: theme.badge, borderColor: theme.surface },
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {(unread[item.id] ?? 0) > 999 ? '999+' : unread[item.id]}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.foreground }]}>
                {item.canonicalTitle}
              </Text>
              <Text style={{ color: theme.secondary, marginTop: 5 }}>
                {item.lastReadAt ? 'Lecture en cours' : 'Pas encore lu'}
              </Text>
            </View>
            <Text style={{ color: theme.accent, fontSize: 22 }}>›</Text>
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
  list: { gap: 10, padding: 20 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  row: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 15,
    minHeight: 100,
    padding: 11,
  },
  cover: { alignItems: 'center', borderRadius: 9, height: 78, justifyContent: 'center', width: 55 },
  badge: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 5,
    position: 'absolute',
    right: -9,
    top: -8,
  },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '800' },
  rowTitle: { fontSize: 16, fontWeight: '700' },
});
