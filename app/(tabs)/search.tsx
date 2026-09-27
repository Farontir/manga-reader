import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { listInstalledSources, type InstalledSource } from '../../db';
import { searchAniList, type AniListManga } from '../../services/anilist';
import { coverImageSource } from '../../services/coverImage';
import { addAniListManga, addSourceManga } from '../../services/librarySources';
import { getSourceRecommendations, searchSource } from '../../sources/api';
import type { SourceManga, SourceRecommendations } from '../../sources/types';
import { EmptyState } from '../../ui/components/EmptyState';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/useTheme';

type Result =
  | { key: string; kind: 'anilist'; manga: AniListManga }
  | { key: string; kind: 'source'; manga: SourceManga; source: InstalledSource };

type Recommendation =
  | { status: 'loading' }
  | { status: 'ready'; data: SourceRecommendations }
  | { status: 'outdated' }
  | { status: 'error' };

function sourcesKey(sources: InstalledSource[]): string {
  return sources.map((source) => `${source.id}@${source.version}`).join('|');
}

export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [sources, setSources] = useState<InstalledSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Record<string, Recommendation>>({});
  const [refreshing, setRefreshing] = useState(false);
  const searchToken = useRef(0);
  const loadedFor = useRef<string | null>(null);

  const loadRecommendations = useCallback(async (installed: InstalledSource[]) => {
    loadedFor.current = sourcesKey(installed);
    setRecommendations(
      Object.fromEntries(installed.map((source) => [source.id, { status: 'loading' } as const])),
    );
    // Sources run one at a time in the sandbox: show each section as soon as it is ready.
    await Promise.all(
      installed.map(async (source) => {
        let next: Recommendation;
        try {
          const data = await getSourceRecommendations(source);
          next = data ? { status: 'ready', data } : { status: 'outdated' };
        } catch {
          next = { status: 'error' };
        }
        setRecommendations((current) => ({ ...current, [source.id]: next }));
      }),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void listInstalledSources().then((installed) => {
        setSources(installed);
        // Reload only when sources were installed, removed or updated.
        if (loadedFor.current !== sourcesKey(installed)) void loadRecommendations(installed);
      });
    }, [loadRecommendations]),
  );

  async function refreshRecommendations() {
    setRefreshing(true);
    try {
      await loadRecommendations(sources);
    } finally {
      setRefreshing(false);
    }
  }

  async function search() {
    const term = query.trim();
    if (term.length < 2) return;
    const token = ++searchToken.current;
    setBusy(true);
    setError(null);
    setResults([]);
    const [anilist, sourceResults] = await Promise.all([
      searchAniList(term).catch(() => null),
      Promise.all(sources.map((source) => searchSource(source, term).catch(() => null))),
    ]);
    if (token !== searchToken.current) return;
    const found: Result[] = [];
    if (anilist) {
      found.push(
        ...anilist.map((manga) => ({
          key: `anilist:${manga.id}`,
          kind: 'anilist' as const,
          manga,
        })),
      );
    }
    sources.forEach((source, index) => {
      const result = sourceResults[index];
      if (result) {
        found.push(
          ...result.map((manga) => ({
            key: `${source.id}:${manga.id}`,
            kind: 'source' as const,
            manga,
            source,
          })),
        );
      }
    });
    if (!anilist && sourceResults.every((result) => result === null)) {
      setError('Recherche indisponible. Réessaie plus tard.');
    }
    setResults(found);
    setBusy(false);
  }

  async function add(result: Result) {
    setAdding(result.key);
    setError(null);
    try {
      const entry =
        result.kind === 'anilist'
          ? await addAniListManga(result.manga)
          : await addSourceManga(result.source.id, result.manga);
      router.push({ pathname: '/entry/[id]', params: { id: entry.id } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setAdding(null);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground }]}>Explorer</Text>
        <Text style={[styles.subtitle, { color: theme.secondary }]}>
          Trouve un manga sur AniList ou dans tes sources installées.
        </Text>
        <View
          style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Ionicons name="search-outline" size={21} color={theme.secondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => {
              void search();
            }}
            returnKeyType="search"
            placeholder="Titre du manga"
            placeholderTextColor={theme.secondary}
            style={[styles.input, { color: theme.foreground }]}
          />
          <Pressable
            onPress={() => {
              void search();
            }}
            accessibilityRole="button"
          >
            <Text style={{ color: theme.accent, fontWeight: '800' }}>Chercher</Text>
          </Pressable>
        </View>
        {error ? <Text style={{ color: theme.danger, marginTop: 10 }}>{error}</Text> : null}
      </View>
      {busy ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 32 }} />
      ) : !query.trim() && sources.length ? (
        <ScrollView
          contentContainerStyle={styles.sections}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void refreshRecommendations();
              }}
              tintColor={theme.accent}
            />
          }
        >
          {sources.map((source) => {
            const state = recommendations[source.id] ?? { status: 'loading' };
            return (
              <View key={source.id} style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.foreground }]}>
                  {state.status === 'ready' ? state.data.title : 'Recommandations'}
                </Text>
                <Text style={[styles.sectionSource, { color: theme.secondary }]}>
                  {source.name}
                </Text>
                {state.status === 'loading' ? (
                  <ActivityIndicator color={theme.accent} style={styles.sectionState} />
                ) : state.status === 'ready' && state.data.items.length ? (
                  <FlatList
                    horizontal
                    data={state.data.items}
                    keyExtractor={(manga) => manga.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carousel}
                    renderItem={({ item: manga }) => {
                      const result: Result = {
                        key: `${source.id}:${manga.id}`,
                        kind: 'source',
                        manga,
                        source,
                      };
                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Ajouter ${manga.title}`}
                          onPress={() => {
                            void add(result);
                          }}
                          disabled={Boolean(adding)}
                          style={styles.card}
                        >
                          {manga.coverUrl ? (
                            <Image
                              source={coverImageSource(manga.coverUrl)}
                              style={styles.cardCover}
                              contentFit="cover"
                            />
                          ) : (
                            <View
                              style={[
                                styles.cardCover,
                                styles.cardPlaceholder,
                                { backgroundColor: theme.surface, borderColor: theme.border },
                              ]}
                            >
                              <Text style={{ color: theme.secondary, fontSize: 28 }}>✦</Text>
                            </View>
                          )}
                          {adding === result.key ? (
                            <ActivityIndicator color={theme.accent} style={styles.cardBusy} />
                          ) : null}
                          <Text
                            numberOfLines={2}
                            style={[styles.cardTitle, { color: theme.foreground }]}
                          >
                            {manga.title}
                          </Text>
                        </Pressable>
                      );
                    }}
                  />
                ) : (
                  <Text style={[styles.sectionState, { color: theme.secondary }]}>
                    {state.status === 'outdated'
                      ? 'Mets à jour cette source dans l’onglet Sources pour voir ses recommandations.'
                      : state.status === 'error'
                        ? 'Recommandations indisponibles pour le moment. Tire vers le bas pour réessayer.'
                        : 'Rien à recommander pour le moment.'}
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.key}
          contentContainerStyle={results.length ? styles.list : styles.emptyList}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title={query ? 'Aucun résultat' : 'Une histoire à découvrir ?'}
              detail={
                sources.length
                  ? 'Cherche par titre pour parcourir AniList et tes sources.'
                  : 'Cherche sur AniList ou installe une source pour accéder aux chapitres.'
              }
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                void add(item);
              }}
              disabled={Boolean(adding)}
              style={[styles.result, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              {item.manga.coverUrl ? (
                <Image
                  source={coverImageSource(item.manga.coverUrl)}
                  style={styles.cover}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.cover, { backgroundColor: theme.border }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultTitle, { color: theme.foreground }]} numberOfLines={2}>
                  {item.manga.title}
                </Text>
                <Text style={{ color: theme.secondary, marginTop: 5, fontSize: 12 }}>
                  {item.kind === 'anilist' ? 'AniList · identité stable' : item.source.name}
                </Text>
              </View>
              {adding === item.key ? (
                <ActivityIndicator color={theme.accent} />
              ) : (
                <Ionicons name="add-circle" size={27} color={theme.accent} />
              )}
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 20 },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 5 },
  searchBox: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  input: { flex: 1, fontSize: 15, minWidth: 0 },
  list: { gap: 10, padding: 20 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  result: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 91,
    padding: 10,
  },
  cover: { borderRadius: 7, height: 67, width: 47 },
  sections: { gap: 26, paddingBottom: 30, paddingTop: 22 },
  section: { gap: 2 },
  sectionTitle: { fontSize: 20, fontWeight: '800', paddingHorizontal: 20 },
  sectionSource: { fontSize: 13, marginBottom: 10, paddingHorizontal: 20 },
  sectionState: { fontSize: 13, lineHeight: 19, marginVertical: 12, paddingHorizontal: 20 },
  carousel: { gap: 12, paddingHorizontal: 20 },
  card: { width: 112 },
  cardCover: { borderRadius: 9, height: 160, width: 112 },
  cardPlaceholder: { alignItems: 'center', borderWidth: 1, justifyContent: 'center' },
  cardBusy: { left: 0, position: 'absolute', right: 0, top: 70 },
  cardTitle: { fontSize: 13, fontWeight: '700', lineHeight: 17, marginTop: 7 },
  resultTitle: { fontSize: 15, fontWeight: '700' },
});
