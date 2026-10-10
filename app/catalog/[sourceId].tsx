import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { getInstalledSource, type InstalledSource } from '../../db';
import { openSourceManga } from '../../services/librarySources';
import { getSourceCatalog } from '../../sources/api';
import type { SourceManga, SourceSort } from '../../sources/types';
import { EmptyState } from '../../ui/components/EmptyState';
import { MangaCover } from '../../ui/components/MangaCarousel';
import { useTheme } from '../../ui/useTheme';

const COLUMNS = 3;
const GAP = 12;
const PADDING = 20;

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** A source's whole catalogue as an endless grid, in the orders the source offers. */
export default function CatalogScreen() {
  const { sourceId } = useLocalSearchParams<{ sourceId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [source, setSource] = useState<InstalledSource | null>(null);
  const [sorts, setSorts] = useState<SourceSort[]>([]);
  const [sort, setSort] = useState<string | null>(null);
  const [items, setItems] = useState<SourceManga[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  // Ignores pages that arrive after the sort changed.
  const token = useRef(0);
  const coverWidth = Math.floor((width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  const loadPage = useCallback(
    async (target: InstalledSource, pageNumber: number, sortId: string | null) => {
      const current = ++token.current;
      setLoading(true);
      setError(null);
      try {
        const result = await getSourceCatalog(target, pageNumber, sortId ?? undefined);
        if (current !== token.current) return;
        if (!result) {
          setUnsupported(true);
          setHasMore(false);
          return;
        }
        setSorts(result.sorts);
        setItems((previous) => {
          const merged = pageNumber === 1 ? [] : [...previous];
          for (const item of result.items) {
            if (!merged.some((known) => known.id === item.id)) merged.push(item);
          }
          return merged;
        });
        setPage(pageNumber);
        setHasMore(result.hasMore && result.items.length > 0);
      } catch (reason) {
        if (current === token.current) setError(message(reason));
      } finally {
        if (current === token.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void getInstalledSource(sourceId).then((found) => {
      if (!active) return;
      setSource(found);
      if (found) void loadPage(found, 1, null);
    });
    return () => {
      active = false;
    };
  }, [sourceId, loadPage]);

  function chooseSort(id: string) {
    if (!source || id === (sort ?? sorts[0]?.id)) return;
    setSort(id);
    setItems([]);
    setHasMore(true);
    void loadPage(source, 1, id);
  }

  function loadMore() {
    if (source && hasMore && !loading && !error) void loadPage(source, page + 1, sort);
  }

  async function open(manga: SourceManga) {
    if (!source) return;
    setOpening(manga.id);
    try {
      const entry = await openSourceManga(source.id, manga);
      router.push({ pathname: '/entry/[id]', params: { id: entry.id } });
    } catch (reason) {
      setError(message(reason));
    } finally {
      setOpening(null);
    }
  }

  const activeSort = sort ?? sorts[0]?.id;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: source?.name ?? 'Catalogue' }} />
      {unsupported ? (
        <EmptyState
          icon="albums-outline"
          title="Pas de catalogue complet"
          detail="Cette source ne propose pas encore de catalogue. Utilise la recherche ou la page Découvrir."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={COLUMNS}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.content}
          onEndReached={loadMore}
          onEndReachedThreshold={0.8}
          ListHeaderComponent={
            sorts.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sorts}
                style={styles.sortsBar}
              >
                {sorts.map((item) => {
                  const selected = item.id === activeSort;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => chooseSort(item.id)}
                      style={[
                        styles.sort,
                        {
                          backgroundColor: selected ? theme.accent : theme.surface,
                          borderColor: selected ? theme.accent : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: selected ? theme.accentText : theme.foreground,
                          fontWeight: '700',
                        }}
                      >
                        {item.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null
          }
          renderItem={({ item }) => (
            <MangaCover
              manga={item}
              width={coverWidth}
              busy={opening === item.id}
              disabled={Boolean(opening)}
              onPress={() => {
                void open(item);
              }}
            />
          )}
          ListEmptyComponent={
            loading ? null : error ? null : (
              <Text style={[styles.note, { color: theme.secondary }]}>
                Aucun titre dans ce catalogue.
              </Text>
            )
          }
          ListFooterComponent={
            <View style={styles.footer}>
              {loading ? <ActivityIndicator color={theme.accent} /> : null}
              {error ? (
                <Pressable
                  onPress={() => {
                    if (source) void loadPage(source, items.length ? page + 1 : 1, sort);
                  }}
                >
                  <Text style={[styles.note, { color: theme.danger }]}>
                    {error} · touche pour réessayer
                  </Text>
                </Pressable>
              ) : null}
              {!loading && !error && !hasMore && items.length ? (
                <Text style={[styles.note, { color: theme.secondary }]}>
                  {items.length} titre{items.length > 1 ? 's' : ''} · fin du catalogue
                </Text>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: 30, paddingHorizontal: PADDING },
  row: { gap: GAP, marginBottom: 18 },
  sortsBar: { marginHorizontal: -PADDING, marginBottom: 16 },
  sorts: { gap: 8, paddingHorizontal: PADDING, paddingTop: 14 },
  sort: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  footer: { alignItems: 'center', minHeight: 60, paddingTop: 10 },
  note: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
