import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';

import { listBindings, listProgress, markBindingHealth, saveProgress } from '../../db';
import { resolveChapterPages, type ReaderPage } from '../../services/readerPages';
import { ZoomablePage } from '../../ui/components/ZoomablePage';
import { useReaderState } from '../../ui/store';
import { useTheme } from '../../ui/useTheme';

const viewabilityConfig = { itemVisiblePercentThreshold: 60 };

export default function ReaderScreen() {
  const { id, chapter, sourceId, chapterId } = useLocalSearchParams<{
    id: string;
    chapter: string;
    sourceId?: string;
    chapterId?: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const { mode, setMode } = useReaderState();
  const [pages, setPages] = useState<ReaderPage[]>([]);
  const [index, setIndex] = useState(0);
  const [initialIndex, setInitialIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const currentIndex = useRef(0);
  const switchingSource = useRef(false);
  const failedSources = useRef(new Set<string>());
  const chapterNumber = Number(chapter);
  const viewportWidth = Dimensions.get('window').width;
  const viewportHeight = Dimensions.get('window').height - 116;

  useEffect(() => {
    if (!id || !Number.isFinite(chapterNumber)) return;
    failedSources.current.clear();
    switchingSource.current = false;
    setError(null);
    setLoading(true);
    setPages([]);
    let active = true;
    void Promise.all([
      resolveChapterPages(id, chapterNumber, sourceId, chapterId),
      listProgress(id),
    ])
      .then(([uris, progress]) => {
        if (!active) return;
        const saved = progress.find((item) => item.chapterNumber === chapterNumber)?.pageIndex ?? 0;
        const start = Math.min(Math.max(saved, 0), Math.max(uris.length - 1, 0));
        currentIndex.current = start;
        setInitialIndex(start);
        setIndex(start);
        setPages(uris);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, chapterNumber, sourceId, chapterId]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<ReaderPage>[] }) => {
      const next = viewableItems.find((item) => item.index !== null)?.index;
      if (next === null || next === undefined || next === currentIndex.current) return;
      currentIndex.current = next;
      setIndex(next);
    },
  ).current;

  useEffect(() => {
    if (!pages.length || !id) return;
    void saveProgress(id, chapterNumber, index, pages.length, index === pages.length - 1);
  }, [id, chapterNumber, index, pages.length]);

  async function handlePageError(source: string | undefined) {
    if (!source) {
      setError('Image locale indisponible. Réimporte ou retélécharge ce chapitre.');
      return;
    }
    if (switchingSource.current || failedSources.current.has(source)) return;
    switchingSource.current = true;
    failedSources.current.add(source);
    try {
      const binding = (await listBindings(id)).find((item) => item.sourceId === source);
      if (binding) await markBindingHealth(binding.id, 'Image indisponible.');
      const replacement = await resolveChapterPages(id, chapterNumber, sourceId, chapterId, [
        ...failedSources.current,
      ]);
      const next = Math.min(currentIndex.current, replacement.length - 1);
      currentIndex.current = next;
      setInitialIndex(next);
      setIndex(next);
      setPages(replacement);
    } catch {
      setError('Images indisponibles sur toutes les sources liées à ce chapitre.');
    } finally {
      switchingSource.current = false;
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.toolbar,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <Pressable
          accessibilityLabel="Retour"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons name="arrow-back" size={23} color={theme.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.foreground, fontWeight: '800', fontSize: 16 }}>
            Chapitre {chapterNumber}
          </Text>
          <Text style={{ color: theme.secondary, fontSize: 12 }}>
            {pages.length ? `${index + 1} / ${pages.length}` : 'Lecture'}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Changer de mode de lecture"
          style={styles.iconButton}
          onPress={() => {
            setInitialIndex(currentIndex.current);
            setMode(mode === 'paged' ? 'webtoon' : 'paged');
          }}
        >
          <Ionicons
            name={mode === 'paged' ? 'reorder-four-outline' : 'book-outline'}
            size={23}
            color={theme.foreground}
          />
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={theme.accent} style={styles.center} size="large" />
      ) : error ? (
        <Text style={[styles.centerText, { color: theme.secondary }]}>{error}</Text>
      ) : (
        <FlatList
          key={mode}
          data={pages}
          keyExtractor={(_, itemIndex) => String(itemIndex)}
          horizontal={mode === 'paged'}
          pagingEnabled={mode === 'paged'}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, itemIndex) => {
            const estimatedLength = mode === 'paged' ? viewportWidth : viewportWidth * 1.45;
            return {
              length: estimatedLength,
              offset: estimatedLength * itemIndex,
              index: itemIndex,
            };
          }}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={2}
          removeClippedSubviews
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item }) => (
            <ZoomablePage
              page={item}
              paged={mode === 'paged'}
              viewportHeight={viewportHeight}
              onError={() => {
                void handlePageError(item.sourceId);
              }}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 60,
    paddingHorizontal: 8,
  },
  iconButton: { alignItems: 'center', justifyContent: 'center', height: 48, width: 48 },
  center: { flex: 1 },
  centerText: { marginTop: 70, padding: 20, textAlign: 'center' },
});
