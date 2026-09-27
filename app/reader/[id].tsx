import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getLocalChapter,
  listBindings,
  listProgress,
  markBindingHealth,
  saveProgress,
} from '../../db';
import { prefetchImage } from '../../services/imageCache';
import { resolveChapterPages, type ReaderPage } from '../../services/readerPages';
import { WebtoonReader } from '../../ui/components/WebtoonReader';
import { ZoomablePage, type EdgeDirection } from '../../ui/components/ZoomablePage';
import { selectionFeedback, successFeedback } from '../../ui/haptics';
import { useReaderState } from '../../ui/store';
import { useTheme } from '../../ui/useTheme';

const viewabilityConfig = { itemVisiblePercentThreshold: 60 };

export default function ReaderScreen() {
  const params = useLocalSearchParams<{
    id: string;
    chapter: string;
    sourceId?: string;
    chapterId?: string;
  }>();
  return (
    <ReaderContent
      key={JSON.stringify([params.id, params.chapter, params.sourceId, params.chapterId])}
      {...params}
    />
  );
}

function ReaderContent({
  id,
  chapter,
  sourceId,
  chapterId,
}: {
  id: string;
  chapter: string;
  sourceId?: string;
  chapterId?: string;
}) {
  const router = useRouter();
  const theme = useTheme();
  const { mode, setMode } = useReaderState();
  const [pages, setPages] = useState<ReaderPage[]>([]);
  const [index, setIndex] = useState(0);
  const [initialIndex, setInitialIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [chapterTitle, setChapterTitle] = useState<string | null>(null);
  // Webtoon mode is full screen: the toolbar floats over the strip and hides while scrolling.
  const [overlayVisible, setOverlayVisible] = useState(true);
  const insets = useSafeAreaInsets();
  const currentIndex = useRef(0);
  const switchingSource = useRef(false);
  const failedSources = useRef(new Set<string>());
  const listRef = useRef<FlatList<ReaderPage>>(null);
  const chapterNumber = Number(chapter);
  const viewportWidth = Dimensions.get('window').width;

  useEffect(() => {
    if (!id || !Number.isFinite(chapterNumber)) return;
    let active = true;
    void Promise.all([
      resolveChapterPages(id, chapterNumber, sourceId, chapterId),
      listProgress(id),
      getLocalChapter(id, chapterNumber),
    ])
      .then(([uris, progress, localChapter]) => {
        if (!active) return;
        const record = progress.find((item) => item.chapterNumber === chapterNumber);
        // A finished chapter is reread from its first page.
        const saved = record && !record.completed ? record.pageIndex : 0;
        const start = Math.min(Math.max(saved, 0), Math.max(uris.length - 1, 0));
        currentIndex.current = start;
        setInitialIndex(start);
        setIndex(start);
        setPages(uris);
        setChapterTitle(localChapter?.title ?? null);
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

  const updateIndex = useCallback((next: number) => {
    if (next === currentIndex.current) return;
    currentIndex.current = next;
    setZoomed(false);
    setIndex(next);
  }, []);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ReaderPage>[] }) => {
      const next = viewableItems.find((item) => item.index !== null)?.index;
      if (next !== null && next !== undefined) updateIndex(next);
    },
    [updateIndex],
  );

  const turnPage = useCallback(
    (direction: EdgeDirection) => {
      const target = currentIndex.current + (direction === 'next' ? 1 : -1);
      if (target < 0 || target >= pages.length) return;
      listRef.current?.scrollToIndex({ index: target, animated: true });
      selectionFeedback();
    },
    [pages.length],
  );

  useEffect(() => {
    if (!pages.length || !id) return;
    void saveProgress(id, chapterNumber, index, pages.length, index === pages.length - 1);
  }, [id, chapterNumber, index, pages.length]);

  useEffect(() => {
    for (const page of [pages[index], pages[index + 1]]) {
      if (page) void prefetchImage(page).catch(() => undefined);
    }
  }, [pages, index]);

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
      setZoomed(false);
      setInitialIndex(next);
      setIndex(next);
      setPages(replacement);
      successFeedback();
    } catch {
      setError('Images indisponibles sur toutes les sources liées à ce chapitre.');
    } finally {
      switchingSource.current = false;
    }
  }

  const toolbar = (
    <View
      style={[styles.toolbar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
    >
      <Pressable
        accessibilityLabel="Retour"
        onPress={() => router.back()}
        style={styles.iconButton}
      >
        <Ionicons name="arrow-back" size={23} color={theme.foreground} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ color: theme.foreground, fontWeight: '800', fontSize: 16 }}
        >
          {chapterTitle ?? `Chapitre ${chapterNumber}`}
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
          setZoomed(false);
          setOverlayVisible(true);
          setMode(mode === 'paged' ? 'webtoon' : 'paged');
          selectionFeedback();
        }}
      >
        <Ionicons
          name={mode === 'paged' ? 'reorder-four-outline' : 'book-outline'}
          size={23}
          color={theme.foreground}
        />
      </Pressable>
    </View>
  );

  if (mode === 'webtoon' && !loading && !error && pages.length) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <StatusBar hidden={!overlayVisible} animated />
        <WebtoonReader
          // A source switch replaces every page: restart the list at the current index.
          key={pages[0]?.uri}
          pages={pages}
          initialIndex={initialIndex}
          onIndexChange={updateIndex}
          onTap={() => setOverlayVisible((visible) => !visible)}
          onScrollStart={() => setOverlayVisible(false)}
          onPageError={(page) => {
            void handlePageError(page.sourceId);
          }}
        />
        {overlayVisible ? (
          <View
            style={[styles.overlay, { paddingTop: insets.top, backgroundColor: theme.surface }]}
          >
            {toolbar}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.root, { backgroundColor: theme.background }]}
    >
      {toolbar}
      {loading ? (
        <ActivityIndicator color={theme.accent} style={styles.center} size="large" />
      ) : error ? (
        <Text style={[styles.centerText, { color: theme.secondary }]}>{error}</Text>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.pages}
          onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
          data={pages}
          keyExtractor={(_, itemIndex) => String(itemIndex)}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, itemIndex) => ({
            length: viewportWidth,
            offset: viewportWidth * itemIndex,
            index: itemIndex,
          })}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={2}
          removeClippedSubviews
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item, index: itemIndex }) => (
            <ZoomablePage
              key={JSON.stringify([item.uri, item.headers])}
              page={item}
              paged
              viewportHeight={viewportHeight}
              onZoomChange={setZoomed}
              onEdgeSwipe={turnPage}
              canGoPrevious={itemIndex > 0}
              canGoNext={itemIndex < pages.length - 1}
              onError={() => {
                void handlePageError(item.sourceId);
              }}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { left: 0, position: 'absolute', right: 0, top: 0 },
  pages: { flex: 1 },
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
