import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getInstalledSource, type InstalledSource } from '../../db';
import { getSourceDiscover } from '../../sources/api';
import type { SourceGenre } from '../../sources/types';
import { useTheme } from '../../ui/useTheme';

export default function SourceGenresScreen() {
  const { sourceId } = useLocalSearchParams<{ sourceId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [source, setSource] = useState<InstalledSource | null>(null);
  const [genres, setGenres] = useState<SourceGenre[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const installed = await getInstalledSource(sourceId);
        if (!installed) throw new Error('Source introuvable.');
        const discovery = await getSourceDiscover(installed);
        if (!active) return;
        setSource(installed);
        setGenres([...discovery.genres].sort((a, b) => a.title.localeCompare(b.title, 'fr')));
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [sourceId, retry]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? genres.filter((genre) => genre.title.toLocaleLowerCase().includes(needle))
      : genres;
  }, [genres, query]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: source ? `Catégories · ${source.name}` : 'Catégories' }} />
      <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="search-outline" size={20} color={theme.secondary} />
        <TextInput
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher une catégorie"
          placeholderTextColor={theme.secondary}
          style={[styles.input, { color: theme.foreground }]}
        />
      </View>
      {loading ? (
        <ActivityIndicator color={theme.accent} style={styles.loading} />
      ) : error ? (
        <Pressable
          onPress={() => {
            setLoading(true);
            setError(null);
            setRetry((count) => count + 1);
          }}
          style={styles.message}
        >
          <Text style={{ color: theme.danger }}>{error} · touche pour réessayer</Text>
        </Pressable>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(genre) => genre.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={[styles.count, { color: theme.secondary }]}>
              {visible.length} catégorie{visible.length > 1 ? 's' : ''}
            </Text>
          }
          ListEmptyComponent={
            <Text style={[styles.count, { color: theme.secondary }]}>
              Aucune catégorie trouvée.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Catégorie ${item.title}`}
              onPress={() =>
                router.push({
                  pathname: '/catalog/[sourceId]',
                  params: { sourceId, listing: item.id, title: item.title },
                })
              }
              style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Text style={[styles.genre, { color: theme.foreground }]}>{item.title}</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.accent} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  search: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    margin: 20,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  input: { flex: 1, fontSize: 15 },
  loading: { marginTop: 30 },
  message: { padding: 20 },
  list: { gap: 8, paddingBottom: 30, paddingHorizontal: 20 },
  count: { fontSize: 13, marginBottom: 8 },
  row: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 54,
    paddingHorizontal: 16,
  },
  genre: { flex: 1, fontSize: 16, fontWeight: '700' },
});
