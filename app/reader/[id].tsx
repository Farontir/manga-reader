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
  listKnownChapters,
  listLocalChapters,
  listProgress,
  markBindingHealth,
  saveProgress,
} from '../../db';
import {
  chapterLabel,
  mergeChapters,
  nextChapter,
  type ChapterItem,
} from '../../services/chapterList';
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
  const [next, setNext] = useState<ChapterItem | null>(null);
  const [advancing, setAdvancing] = useState(false);
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

  const updateIndex = useCallback((page: number) => {
    if (page === currentIndex.current) return;
    currentIndex.current = page;
    setZoomed(false);
    setIndex(page);
  }, []);

  useEffect(() => {
    if (!id || !Number.isFinite(chapterNumber)) return;
    let active = true;
    void Promise.all([listLocalChapters(id), listKnownChapters(id), listBindings(id)])
      .then(([local, remote, bindings]) => {
        if (active) setNext(nextChapter(mergeChapters(local, remote, bindings), chapterNumber));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [id, chapterNumber]);

  // Replacing the route remounts the reader on the next chapter; this one flushes its
  // progress (last page, so completed) while unmounting.
  function openNextChapter() {
    if (!next || advancing) return;
    setAdvancing(true);
    successFeedback();
    router.replace({
      pathname: '/reader/[id]',
      params: {
        id,
        chapter: String(next.number),
        sourceId: next.sourceId,
        chapterId: next.chapterId,
      },
    });
  }

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

  // Scrolling a webtoon changes the page many times per second: save once it settles,
  // and flush the last position when the reader closes.
  const pendingSave = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!pages.length || !id) return;
    const save = () => {
      pendingSave.current = null;
      saveProgress(id, chapterNumber, index, pages.length, index === pages.length - 1).catch(
        (reason: unknown) => {
          if (__DEV__) console.warn('[reader] progression non enregistrée', reason);
        },
      );
    };
    pendingSave.current = save;
    const timer = setTimeout(save, 400);
    return () => clearTimeout(timer);
  }, [id, chapterNumber, index, pages.length]);
  useEffect(() => () => pendingSave.current?.(), []);

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
          onReachEnd={openNextChapter}
          footer={
            <Pressable
              accessibilityRole="button"
              disabled={!next || advancing}
              onPress={openNextChapter}
              style={[styles.chapterEnd, { minHeight: Dimensions.get('window').height * 0.35 }]}
            >
              <Text style={{ color: theme.secondary, fontSize: 13 }}>
                Fin · {chapterTitle ?? `Chapitre ${chapterNumber}`}
              </Text>
              {next ? (
                <>
                  <Text style={[styles.chapterEndTitle, { color: theme.foreground }]}>
                    Chapitre suivant : {chapterLabel(next)}
                  </Text>
                  {advancing ? (
                    <ActivityIndicator color={theme.accent} style={{ marginTop: 12 }} />
                  ) : (
                    <Text style={[styles.chapterEndHint, { color: theme.accent }]}>
                      Descends jusqu’en bas ou touche pour continuer
                    </Text>
                  )}
                </>
              ) : (
                <Text style={[styles.chapterEndTitle, { color: theme.foreground }]}>
                  Dernier chapitre disponible
                </Text>
              )}
            </Pressable>
          }
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
  chapterEnd: { alignItems: 'center', gap: 6, justifyContent: 'center', padding: 28 },
  chapterEndTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  chapterEndHint: { fontSize: 13, fontWeight: '700', marginTop: 6, textAlign: 'center' },
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
