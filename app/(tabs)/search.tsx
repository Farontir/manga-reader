import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { listInstalledSources, listSensitiveAniListIds, type InstalledSource } from '../../db';
import { searchAniList, type AniListManga } from '../../services/anilist';
import { coverImageSource } from '../../services/coverImage';
import { openSearchGroup } from '../../services/librarySources';
import { groupSearchResults, type SearchGroup, type SearchHit } from '../../services/searchGroups';
import { isSensitiveSourceManga } from '../../services/sensitive';
import { searchSource } from '../../sources/api';
import { EmptyState } from '../../ui/components/EmptyState';
import { Screen } from '../../ui/components/Screen';
import { useShowSensitive } from '../../ui/privacy';
import { useTheme } from '../../ui/useTheme';

type Result = SearchGroup<InstalledSource>;

export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [sources, setSources] = useState<InstalledSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchToken = useRef(0);
  const showSensitive = useShowSensitive();
  const [sensitiveIds, setSensitiveIds] = useState<Set<number>>(new Set());
  useFocusEffect(
    useCallback(() => {
      void listInstalledSources().then(setSources);
      void listSensitiveAniListIds().then(setSensitiveIds);
    }, []),
  );
  // While sensitive content is hidden, so are results rated sensitive by a source or
  // matching a sensitive manga of the library (AniList itself returns no adult title).
  const shown = useMemo(
    () =>
      showSensitive
        ? results
        : results.filter(
            (result) =>
              !(result.anilist && sensitiveIds.has(result.anilist.id)) &&
              !result.sources.some(({ manga }) => isSensitiveSourceManga(manga)),
          ),
    [results, sensitiveIds, showSensitive],
  );

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
    // One result per manga, whatever the number of sources offering it.
    const hits: SearchHit<InstalledSource>[] = (anilist ?? []).map((manga: AniListManga) => ({
      kind: 'anilist' as const,
      manga,
    }));
    sources.forEach((source, index) => {
      for (const manga of sourceResults[index] ?? []) {
        hits.push({ kind: 'source', manga, source });
      }
    });
    const found = groupSearchResults(hits);
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
      const entry = await openSearchGroup(result);
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
        <Text style={[styles.title, { color: theme.foreground }]}>Recherche</Text>
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
          {query || results.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Effacer la recherche"
              hitSlop={8}
              onPress={() => {
                searchToken.current += 1;
                setQuery('');
                setResults([]);
                setError(null);
                setBusy(false);
              }}
            >
              <Ionicons name="close-circle" size={20} color={theme.secondary} />
            </Pressable>
          ) : null}
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
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(item) => item.key}
          contentContainerStyle={shown.length ? styles.list : styles.emptyList}
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
              {item.coverUrl ? (
                <Image
                  source={coverImageSource(item.coverUrl)}
                  style={styles.cover}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.cover, { backgroundColor: theme.border }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultTitle, { color: theme.foreground }]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ color: theme.secondary, marginTop: 5, fontSize: 12 }}
                >
                  {[
                    ...(item.anilist ? ['AniList'] : []),
                    ...item.sources.map((entry) => entry.source.name),
                  ].join(' · ')}
                </Text>
              </View>
              {adding === item.key ? (
                <ActivityIndicator color={theme.accent} />
              ) : (
                <Ionicons name="chevron-forward" size={22} color={theme.secondary} />
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
  resultTitle: { fontSize: 15, fontWeight: '700' },
});
