import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  countUnreadChapters,
  getSetting,
  listInstalledSources,
  listLibraryEntries,
  LOCAL_FILES,
  setSetting,
  type InstalledSource,
  type LibraryEntry,
  type LibrarySort,
} from '../../db';
import { filterLibrary, unreadFirst } from '../../services/librarySearch';
import { EmptyState } from '../../ui/components/EmptyState';
import { LibraryCoverImage } from '../../ui/components/LibraryCoverImage';
import { dismissFolderSyncMessage, pickWatchedFolder, useFolderSync } from '../../ui/folderSync';
import { refreshLibrary, useLibraryRefresh } from '../../ui/libraryRefresh';
import { toggleSensitiveLock, usePrivacy, useShowSensitive } from '../../ui/privacy';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/useTheme';

const SORT_KEY = 'library.sort';
const SOURCE_KEY = 'library.source';
const SORTS: { id: LibrarySort; label: string }[] = [
  { id: 'read', label: 'Lecture récente' },
  { id: 'added', label: 'Ajout récent' },
  { id: 'title', label: 'Titre A–Z' },
  { id: 'unread', label: 'Non lus d’abord' },
];

function isSort(value: string | null): value is LibrarySort {
  return SORTS.some((sort) => sort.id === value);
}

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const sync = useFolderSync();
  const refresh = useLibraryRefresh();
  const [pulling, setPulling] = useState(false);
  const showSensitive = useShowSensitive();
  const unlocked = usePrivacy((state) => state.unlocked);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('read');
  const [source, setSource] = useState<string | null>(null);
  const [sources, setSources] = useState<InstalledSource[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    void Promise.all([getSetting(SORT_KEY), getSetting(SOURCE_KEY)]).then(([saved, filter]) => {
      if (isSort(saved)) setSort(saved);
      setSource(filter || null);
      setPrefsLoaded(true);
    });
  }, []);
  const reload = useCallback(() => {
    if (!prefsLoaded) return;
    void Promise.all([
      listLibraryEntries({ includeSensitive: showSensitive, sort, source }),
      countUnreadChapters({ includeSensitive: showSensitive }),
      listInstalledSources(),
    ]).then(([list, counts, installed]) => {
      setEntries(list);
      setUnread(counts);
      setSources(installed);
    });
  }, [showSensitive, sort, source, prefsLoaded]);
  const shown = useMemo(() => {
    const found = filterLibrary(entries, query);
    return sort === 'unread' ? unreadFirst(found, unread) : found;
  }, [entries, query, sort, unread]);
  const filters = [
    { id: null, label: 'Toutes' },
    ...sources.map((item) => ({ id: item.id, label: item.name })),
    { id: LOCAL_FILES, label: 'Fichiers locaux' },
  ];

  function chooseSort() {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Trier la bibliothèque',
        options: [
          ...SORTS.map((item) => (item.id === sort ? `✓ ${item.label}` : item.label)),
          'Annuler',
        ],
        cancelButtonIndex: SORTS.length,
      },
      (index) => {
        const chosen = SORTS[index];
        if (!chosen) return;
        setSort(chosen.id);
        void setSetting(SORT_KEY, chosen.id);
      },
    );
  }

  function chooseSource(id: string | null) {
    setSource(id);
    void setSetting(SOURCE_KEY, id ?? '');
  }
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
          {/* Long press (1 s): show or hide sensitive content. Deliberately unlabelled. */}
          <Pressable
            delayLongPress={1000}
            onLongPress={() => {
              void toggleSensitiveLock();
            }}
            style={styles.titleRow}
          >
            <Text accessibilityRole="header" style={[styles.title, { color: theme.foreground }]}>
              Bibliothèque
            </Text>
            {unlocked ? <View style={[styles.dot, { backgroundColor: theme.accent }]} /> : null}
          </Pressable>
        </View>
        <Text style={{ color: theme.secondary }}>
          {shown.length} manga{shown.length > 1 ? 's' : ''}
        </Text>
      </View>
      <View style={styles.tools}>
        <View
          style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Ionicons name="search-outline" size={18} color={theme.secondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            placeholder="Rechercher dans la bibliothèque"
            placeholderTextColor={theme.secondary}
            style={[styles.searchInput, { color: theme.foreground }]}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Effacer la recherche"
              hitSlop={8}
              onPress={() => setQuery('')}
            >
              <Ionicons name="close-circle" size={18} color={theme.secondary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Trier : ${SORTS.find((item) => item.id === sort)?.label ?? ''}`}
          onPress={chooseSort}
          style={[styles.sortButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Ionicons name="swap-vertical" size={20} color={theme.accent} />
        </Pressable>
      </View>
      {sources.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          style={styles.filtersBar}
        >
          {filters.map((item) => {
            const selected = item.id === source;
            return (
              <Pressable
                key={item.id ?? 'all'}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => chooseSource(item.id)}
                // Static style only: NativeWind drops Pressable style callbacks on device.
                style={[
                  styles.filter,
                  selected
                    ? { backgroundColor: theme.accent, borderColor: theme.accent }
                    : { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text
                  style={{
                    color: selected ? theme.accentText : theme.foreground,
                    fontSize: 13,
                    fontWeight: '700',
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
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
        data={shown}
        keyExtractor={(item) => item.id}
        refreshing={pulling}
        onRefresh={() => {
          void pullToRefresh();
        }}
        contentContainerStyle={shown.length ? styles.list : styles.emptyList}
        ListEmptyComponent={
          query || source ? (
            <EmptyState
              icon="search-outline"
              title="Aucun manga trouvé"
              detail="Essaie un autre titre ou un autre filtre."
            />
          ) : (
            <EmptyState
              icon="book-outline"
              title="Ta bibliothèque t’attend"
              detail="Ajoute un manga depuis Découvrir ou Recherche. Ta progression restera ici, même si une source disparaît."
            />
          )
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
              <LibraryCoverImage
                uri={item.coverUrl}
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
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  dot: { borderRadius: 3, height: 6, width: 6 },
  listContainer: { flex: 1 },
  tools: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14 },
  searchBox: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    height: 42,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 15 },
  sortButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  filtersBar: { flexGrow: 0, marginTop: 10 },
  filters: { gap: 8, paddingHorizontal: 20 },
  filter: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
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
