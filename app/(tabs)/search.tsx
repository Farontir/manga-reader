import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { listInstalledSources, type InstalledSource } from '../../db';
import { searchAniList, type AniListManga } from '../../services/anilist';
import { addAniListManga, addSourceManga } from '../../services/librarySources';
import { searchSource } from '../../sources/api';
import type { SourceManga } from '../../sources/types';
import { EmptyState } from '../../ui/components/EmptyState';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/useTheme';

type Result = { key: string; kind: 'anilist'; manga: AniListManga } |
  { key: string; kind: 'source'; manga: SourceManga; source: InstalledSource };

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
  useFocusEffect(useCallback(() => { void listInstalledSources().then(setSources); }, []));

  async function search() {
    const term = query.trim();
    if (term.length < 2) return;
    const token = ++searchToken.current;
    setBusy(true); setError(null); setResults([]);
    const [anilist, sourceResults] = await Promise.all([
      searchAniList(term).catch(() => null),
      Promise.all(sources.map((source) => searchSource(source, term).catch(() => null))),
    ]);
    if (token !== searchToken.current) return;
    const found: Result[] = [];
    if (anilist) {
      found.push(...anilist.map((manga) => ({
        key: `anilist:${manga.id}`, kind: 'anilist' as const, manga,
      })));
    }
    sources.forEach((source, index) => {
      const result = sourceResults[index];
      if (result) {
        found.push(...result.map((manga) => ({
          key: `${source.id}:${manga.id}`, kind: 'source' as const, manga, source,
        })));
      }
    });
    if (!anilist && sourceResults.every((result) => result === null)) {
      setError('Recherche indisponible. Réessaie plus tard.');
    }
    setResults(found); setBusy(false);
  }

  async function add(result: Result) {
    setAdding(result.key); setError(null);
    try {
      const entry = result.kind === 'anilist'
        ? await addAniListManga(result.manga)
        : await addSourceManga(result.source.id, result.manga);
      router.push({ pathname: '/entry/[id]', params: { id: entry.id } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setAdding(null); }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground }]}>Explorer</Text>
        <Text style={[styles.subtitle, { color: theme.secondary }]}>
          Trouve un manga sur AniList ou dans tes sources installées.
        </Text>
        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search-outline" size={21} color={theme.secondary} />
          <TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => { void search(); }}
            returnKeyType="search" placeholder="Titre du manga" placeholderTextColor={theme.secondary}
            style={[styles.input, { color: theme.foreground }]} />
          <Pressable onPress={() => { void search(); }} accessibilityRole="button">
            <Text style={{ color: theme.accent, fontWeight: '800' }}>Chercher</Text>
          </Pressable>
        </View>
        {error ? <Text style={{ color: theme.danger, marginTop: 10 }}>{error}</Text> : null}
      </View>
      {busy ? <ActivityIndicator color={theme.accent} style={{ marginTop: 32 }} /> :
        <FlatList data={results} keyExtractor={(item) => item.key}
          contentContainerStyle={results.length ? styles.list : styles.emptyList}
          ListEmptyComponent={<EmptyState icon="search-outline"
            title={query ? 'Aucun résultat' : 'Une histoire à découvrir ?'}
            detail={sources.length ? 'Cherche par titre pour parcourir AniList et tes sources.' :
              'Cherche sur AniList ou installe une source pour accéder aux chapitres.'} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => { void add(item); }} disabled={Boolean(adding)}
              style={[styles.result, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {item.manga.coverUrl ? <Image source={{ uri: item.manga.coverUrl }}
                style={styles.cover} contentFit="cover" /> : <View style={[styles.cover, { backgroundColor: theme.border }]} />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultTitle, { color: theme.foreground }]} numberOfLines={2}>
                  {item.manga.title}
                </Text>
                <Text style={{ color: theme.secondary, marginTop: 5, fontSize: 12 }}>
                  {item.kind === 'anilist' ? 'AniList · identité stable' : item.source.name}
                </Text>
              </View>
              {adding === item.key ? <ActivityIndicator color={theme.accent} /> :
                <Ionicons name="add-circle" size={27} color={theme.accent} />}
            </Pressable>
          )} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 20 },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 5 },
  searchBox: { alignItems: 'center', borderRadius: 14, borderWidth: 1,
    flexDirection: 'row', gap: 10, marginTop: 22, minHeight: 52, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 15, minWidth: 0 },
  list: { gap: 10, padding: 20 }, emptyList: { flexGrow: 1, justifyContent: 'center' },
  result: { alignItems: 'center', borderRadius: 15, borderWidth: 1,
    flexDirection: 'row', gap: 13, minHeight: 91, padding: 10 },
  cover: { borderRadius: 7, height: 67, width: 47 },
  resultTitle: { fontSize: 15, fontWeight: '700' },
});
