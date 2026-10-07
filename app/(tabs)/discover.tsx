import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getSetting, listInstalledSources, setSetting, type InstalledSource } from '../../db';
import { addSourceManga } from '../../services/librarySources';
import { getSourceDiscover, searchSource } from '../../sources/api';
import type { SourceManga, SourceSection } from '../../sources/types';
import { ActionButton } from '../../ui/components/ActionButton';
import { EmptyState } from '../../ui/components/EmptyState';
import { MangaCarousel, MangaCover } from '../../ui/components/MangaCarousel';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/useTheme';

const SELECTED_SOURCE_KEY = 'discover.source';

type DiscoverState =
  | { status: 'loading' }
  | { status: 'ready'; sections: SourceSection[]; supported: boolean }
  | { status: 'error'; message: string };

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** One tab per installed source; each tab shows that source's Discover page and search. */
export default function DiscoverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [sources, setSources] = useState<InstalledSource[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pages, setPages] = useState<Record<string, DiscoverState>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SourceManga[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Version loaded per source: an updated source reloads its page.
  const loaded = useRef(new Map<string, string>());
  const selectedRef = useRef<string | null>(null);
  const searchToken = useRef(0);

  const load = useCallback(async (source: InstalledSource, force: boolean) => {
    if (!force && loaded.current.get(source.id) === source.version) return;
    loaded.current.set(source.id, source.version);
    setPages((current) => ({ ...current, [source.id]: { status: 'loading' } }));
    let next: DiscoverState;
    try {
      next = { status: 'ready', ...(await getSourceDiscover(source)) };
    } catch (reason) {
      loaded.current.delete(source.id);
      next = { status: 'error', message: message(reason) };
    }
    setPages((current) => ({ ...current, [source.id]: next }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const installed = await listInstalledSources();
        const preferred = selectedRef.current ?? (await getSetting(SELECTED_SOURCE_KEY));
        if (!active) return;
        const chosen = installed.find((source) => source.id === preferred) ?? installed[0];
        selectedRef.current = chosen?.id ?? null;
        setSources(installed);
        setSelectedId(chosen?.id ?? null);
        if (chosen) void load(chosen, false);
      })();
      return () => {
        active = false;
      };
    }, [load]),
  );

  const selected = sources.find((source) => source.id === selectedId) ?? null;
  const page = selected ? pages[selected.id] : undefined;

  function select(source: InstalledSource) {
    if (source.id === selectedId) return;
    selectedRef.current = source.id;
    searchToken.current += 1;
    setSelectedId(source.id);
    setQuery('');
    setResults(null);
    setSearching(false);
    setError(null);
    void setSetting(SELECTED_SOURCE_KEY, source.id);
    void load(source, false);
  }

  async function search() {
    const term = query.trim();
    if (!selected || term.length < 2) return;
    const token = ++searchToken.current;
    setSearching(true);
    setError(null);
    try {
      const found = await searchSource(selected, term);
      if (token === searchToken.current) setResults(found);
    } catch (reason) {
      if (token === searchToken.current) {
        setResults([]);
        setError(`Recherche impossible : ${message(reason)}`);
      }
    } finally {
      if (token === searchToken.current) setSearching(false);
    }
  }

  function clearSearch() {
    searchToken.current += 1;
    setQuery('');
    setResults(null);
    setSearching(false);
    setError(null);
  }

  async function refresh() {
    if (!selected) return;
    setRefreshing(true);
    try {
      await load(selected, true);
    } finally {
      setRefreshing(false);
    }
  }

  async function add(manga: SourceManga) {
    if (!selected) return;
    setAdding(manga.id);
    setError(null);
    try {
      const entry = await addSourceManga(selected.id, manga);
      router.push({ pathname: '/entry/[id]', params: { id: entry.id } });
    } catch (reason) {
      setError(message(reason));
    } finally {
      setAdding(null);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground }]}>Découvrir</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Gérer les sources"
          onPress={() => router.push('/sources')}
          style={styles.headerButton}
        >
          <Ionicons name="layers-outline" size={24} color={theme.accent} />
        </Pressable>
      </View>
      {!sources.length ? (
        <View style={styles.empty}>
          <EmptyState
            icon="compass-outline"
            title="Aucune source installée"
            detail="Installe une source pour parcourir ses nouveautés et ses titres populaires."
          />
          <View style={styles.emptyAction}>
            <ActionButton
              label="Gérer les sources"
              icon="layers-outline"
              onPress={() => router.push('/sources')}
            />
          </View>
        </View>
      ) : (
        <>
          <View style={[styles.tabsBar, { borderBottomColor: theme.border }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabs}
            >
              {sources.map((source) => {
                const active = source.id === selectedId;
                return (
                  <Pressable
                    key={source.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => select(source)}
                    style={[styles.tab, active && { borderBottomColor: theme.accent }]}
                  >
                    <Text
                      style={[styles.tabLabel, { color: active ? theme.accent : theme.foreground }]}
                    >
                      {source.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  void refresh();
                }}
                tintColor={theme.accent}
              />
            }
          >
            <View
              style={[
                styles.searchBox,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Ionicons name="search-outline" size={20} color={theme.secondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => {
                  void search();
                }}
                returnKeyType="search"
                autoCorrect={false}
                placeholder={selected ? `Rechercher dans ${selected.name}` : 'Rechercher'}
                placeholderTextColor={theme.secondary}
                style={[styles.input, { color: theme.foreground }]}
              />
              {query || results ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Effacer la recherche"
                  onPress={clearSearch}
                >
                  <Ionicons name="close-circle" size={20} color={theme.secondary} />
                </Pressable>
              ) : null}
            </View>
            {error ? <Text style={[styles.note, { color: theme.danger }]}>{error}</Text> : null}
            {searching ? (
              <ActivityIndicator color={theme.accent} style={styles.spinner} />
            ) : results ? (
              results.length ? (
                <View style={styles.grid}>
                  {results.map((manga) => (
                    <MangaCover
                      key={manga.id}
                      manga={manga}
                      busy={adding === manga.id}
                      disabled={Boolean(adding)}
                      onPress={() => {
                        void add(manga);
                      }}
                    />
                  ))}
                </View>
              ) : (
                <Text style={[styles.note, { color: theme.secondary }]}>Aucun résultat.</Text>
              )
            ) : !page || page.status === 'loading' ? (
              <ActivityIndicator color={theme.accent} style={styles.spinner} />
            ) : page.status === 'error' ? (
              <View style={styles.note}>
                <Text style={{ color: theme.secondary }}>
                  Page indisponible pour le moment ({page.message}).
                </Text>
                <Pressable
                  onPress={() => {
                    void refresh();
                  }}
                  style={{ marginTop: 10 }}
                >
                  <Text style={{ color: theme.accent, fontWeight: '700' }}>Réessayer</Text>
                </Pressable>
              </View>
            ) : page.sections.length ? (
              page.sections.map((section, index) => (
                <View key={`${index}:${section.title}`} style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: theme.foreground }]}>
                    {section.title}
                  </Text>
                  <MangaCarousel
                    items={section.items}
                    variant={index === 0 ? 'featured' : 'regular'}
                    busyId={adding}
                    onPress={(manga) => {
                      void add(manga);
                    }}
                  />
                </View>
              ))
            ) : (
              <Text style={[styles.note, { color: theme.secondary }]}>
                {page.supported
                  ? 'Rien à afficher pour le moment. Tire vers le bas pour actualiser.'
                  : 'Cette source ne propose pas de page Découvrir. Utilise la recherche ci-dessus.'}
              </Text>
            )}
          </ScrollView>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: { fontSize: 32, fontWeight: '800' },
  headerButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  tabsBar: { borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 10 },
  tabs: { gap: 22, paddingHorizontal: 20 },
  tab: { borderBottomColor: 'transparent', borderBottomWidth: 3, paddingVertical: 11 },
  tabLabel: { fontSize: 16, fontWeight: '700' },
  content: { gap: 26, paddingBottom: 36, paddingTop: 18 },
  searchBox: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 20,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  input: { flex: 1, fontSize: 15, minWidth: 0 },
  spinner: { marginTop: 30 },
  note: { fontSize: 14, lineHeight: 21, paddingHorizontal: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 20 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 21, fontWeight: '800', paddingHorizontal: 20 },
  empty: { flex: 1, justifyContent: 'center' },
  emptyAction: { paddingHorizontal: 40 },
});
