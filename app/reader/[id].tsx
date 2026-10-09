import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { createProgressSaver } from '../../services/progressSaver';
import {
  buildFeed,
  feedIndexOf,
  feedPosition,
  shouldLoadNext,
  type FeedItem,
  type FeedSegment,
} from '../../services/readerFeed';
import { resolveChapterPages, type ReaderPage } from '../../services/readerPages';
import { ChapterTransition, type TransitionState } from '../../ui/components/ChapterTransition';
import { WebtoonReader } from '../../ui/components/WebtoonReader';
import { ZoomablePage, type EdgeDirection } from '../../ui/components/ZoomablePage';
import { selectionFeedback, successFeedback } from '../../ui/haptics';
import { useReaderState } from '../../ui/store';
import { useTheme } from '../../ui/useTheme';

const viewabilityConfig = { itemVisiblePercentThreshold: 60 };

type Saver = ReturnType<typeof createProgressSaver>;

export default function ReaderScreen() {
  const setOpen = useReaderState((state) => state.setOpen);
  useEffect(() => {
    setOpen(true);
    return () => setOpen(false);
  }, [setOpen]);
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

function ReaderToolbar({
  title,
  counter,
  paged,
  onToggleMode,
}: {
  title: string;
  counter: string;
  paged: boolean;
  onToggleMode: () => void;
}) {
  const router = useRouter();
  const theme = useTheme();
  return (
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
          {title}
        </Text>
        <Text style={{ color: theme.secondary, fontSize: 12 }}>{counter}</Text>
      </View>
      <Pressable
        accessibilityLabel="Changer de mode de lecture"
        style={styles.iconButton}
        onPress={() => {
          onToggleMode();
          selectionFeedback();
        }}
      >
        <Ionicons
          name={paged ? 'reorder-four-outline' : 'book-outline'}
          size={23}
          color={theme.foreground}
        />
      </Pressable>
    </View>
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
  const [chapters, setChapters] = useState<ChapterItem[] | null>(null);
  const [opening, setOpening] = useState(false);
  const currentIndex = useRef(0);
  const switchingSource = useRef(false);
  const failedSources = useRef(new Set<string>());
  const listRef = useRef<FlatList<FeedItem>>(null);
  const chapterNumber = Number(chapter);
  const viewportWidth = Dimensions.get('window').width;
  const title = chapterTitle ?? `Chapitre ${chapterNumber}`;
  const next = chapters ? nextChapter(chapters, chapterNumber) : null;

  const saver = useMemo(
    () =>
      createProgressSaver((number, page, total, completed) =>
        saveProgress(id, number, page, total, completed),
      ),
    [id],
  );
  useEffect(() => () => saver.flush(), [saver]);

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
        saver.record(chapterNumber, start, uris.length);
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
  }, [id, chapterNumber, sourceId, chapterId, saver]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void Promise.all([listLocalChapters(id), listKnownChapters(id), listBindings(id)])
      .then(([local, remote, bindings]) => {
        if (active) setChapters(mergeChapters(local, remote, bindings));
      })
      .catch(() => {
        if (active) setChapters([]);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const openChapter = useCallback(
    (target: { number: number; sourceId?: string; chapterId?: string }) => {
      saver.flush();
      router.replace({
        pathname: '/reader/[id]',
        params: {
          id,
          chapter: String(target.number),
          sourceId: target.sourceId,
          chapterId: target.chapterId,
        },
      });
    },
    [id, router, saver],
  );

  // Paged mode: the chapter ends with a transition page that opens the next chapter.
  const pagedItems = useMemo(
    () => buildFeed([{ number: chapterNumber, title, pages }]),
    [chapterNumber, title, pages],
  );

  const openNextFromPaged = useCallback(() => {
    if (!next || opening) return;
    setOpening(true);
    successFeedback();
    openChapter(next);
  }, [next, opening, openChapter]);

  const updatePagedIndex = useCallback(
    (itemIndex: number) => {
      if (itemIndex === currentIndex.current) return;
      currentIndex.current = itemIndex;
      setZoomed(false);
      setIndex(itemIndex);
      const position = feedPosition(pagedItems, itemIndex);
      if (position) saver.record(chapterNumber, position.page, pages.length);
      if (pagedItems[itemIndex]?.kind === 'transition') openNextFromPaged();
    },
    [pagedItems, saver, chapterNumber, pages.length, openNextFromPaged],
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<FeedItem>[] }) => {
      const visible = viewableItems.find((item) => item.index !== null)?.index;
      if (visible !== null && visible !== undefined) updatePagedIndex(visible);
    },
    [updatePagedIndex],
  );

  const turnPage = useCallback(
    (direction: EdgeDirection) => {
      const target = currentIndex.current + (direction === 'next' ? 1 : -1);
      if (target < 0 || target >= pagedItems.length) return;
      listRef.current?.scrollToIndex({ index: target, animated: true });
      selectionFeedback();
    },
    [pagedItems.length],
  );

  const pageIndex = Math.min(index, Math.max(pages.length - 1, 0));
  useEffect(() => {
    if (mode !== 'paged') return;
    for (const page of [pages[pageIndex], pages[pageIndex + 1]]) {
      if (page) void prefetchImage(page).catch(() => undefined);
    }
  }, [mode, pages, pageIndex]);

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
      const target = Math.min(currentIndex.current, replacement.length - 1);
      currentIndex.current = target;
      setZoomed(false);
      setInitialIndex(target);
      setIndex(target);
      setPages(replacement);
      successFeedback();
    } catch {
      setError('Images indisponibles sur toutes les sources liées à ce chapitre.');
    } finally {
      switchingSource.current = false;
    }
  }

  if (mode === 'webtoon' && !loading && !error && pages.length) {
    return (
      <WebtoonSession
        // A source switch replaces every page: restart the session on the new pages.
        key={pages[0]?.uri}
        entryId={id}
        initial={{ number: chapterNumber, title, sourceId, chapterId, pages }}
        initialPage={pageIndex}
        chapters={chapters}
        saver={saver}
        onFatalError={setError}
        onPaged={(segment, page) => {
          saver.flush();
          setMode('paged');
          if (segment.number === chapterNumber) {
            currentIndex.current = page;
            setInitialIndex(page);
            setIndex(page);
          } else {
            openChapter(segment);
          }
        }}
      />
    );
  }

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.root, { backgroundColor: theme.background }]}
    >
      <ReaderToolbar
        title={title}
        counter={pages.length ? `${pageIndex + 1} / ${pages.length}` : 'Lecture'}
        paged={mode === 'paged'}
        onToggleMode={() => {
          setInitialIndex(pageIndex);
          setZoomed(false);
          setMode(mode === 'paged' ? 'webtoon' : 'paged');
        }}
      />
      {loading ? (
        <ActivityIndicator color={theme.accent} style={styles.center} size="large" />
      ) : error ? (
        <Text style={[styles.centerText, { color: theme.secondary }]}>{error}</Text>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.pages}
          onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
          data={pagedItems}
          keyExtractor={(item) => item.key}
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
          renderItem={({ item, index: itemIndex }) =>
            item.kind === 'transition' ? (
              <ChapterTransition
                finished={title}
                next={next ? chapterLabel(next) : null}
                state={next ? 'loading' : 'last'}
                width={viewportWidth}
                minHeight={viewportHeight}
                onPress={next ? openNextFromPaged : undefined}
              />
            ) : (
              <ZoomablePage
                key={JSON.stringify([item.data.uri, item.data.headers])}
                page={item.data}
                paged
                viewportHeight={viewportHeight}
                onZoomChange={setZoomed}
                onEdgeSwipe={turnPage}
                canGoPrevious={itemIndex > 0}
                canGoNext={itemIndex < pagedItems.length - 1}
                onError={() => {
                  void handlePageError(item.data.sourceId);
                }}
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Continuous webtoon reading: the next chapter is appended below the current one a few
 * pages before its end, so scrolling never stops between chapters.
 */
function WebtoonSession({
  entryId,
  initial,
  initialPage,
  chapters,
  saver,
  onFatalError,
  onPaged,
}: {
  entryId: string;
  initial: FeedSegment;
  initialPage: number;
  chapters: ChapterItem[] | null;
  saver: Saver;
  onFatalError: (message: string) => void;
  onPaged: (segment: FeedSegment, page: number) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;
  const [segments, setSegments] = useState<FeedSegment[]>([initial]);
  const [position, setPosition] = useState({ segment: 0, page: initialPage });
  const positionRef = useRef(position);
  const [nextState, setNextState] = useState<'idle' | 'failed'>('idle');
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [initialIndex] = useState(() => feedIndexOf(buildFeed([initial]), 0, initialPage));
  const items = useMemo(() => buildFeed(segments), [segments]);
  const loadingNext = useRef(false);
  const switching = useRef(false);
  const failedSources = useRef(new Map<number, Set<string>>());

  const loadNext = useCallback(async () => {
    const last = segments[segments.length - 1];
    if (!last || !chapters || loadingNext.current) return;
    const following = nextChapter(chapters, last.number);
    if (!following) return;
    loadingNext.current = true;
    try {
      const pages = await resolveChapterPages(
        entryId,
        following.number,
        following.sourceId,
        following.chapterId,
      );
      setSegments((current) =>
        current.some((segment) => segment.number === following.number)
          ? current
          : [
              ...current,
              {
                number: following.number,
                title: chapterLabel(following),
                sourceId: following.sourceId,
                chapterId: following.chapterId,
                pages,
              },
            ],
      );
      setNextState('idle');
    } catch {
      setNextState('failed');
    } finally {
      loadingNext.current = false;
    }
  }, [segments, chapters, entryId]);

  const onIndexChange = useCallback(
    (itemIndex: number) => {
      const next = feedPosition(items, itemIndex);
      const current = positionRef.current;
      if (!next || (current.segment === next.segment && current.page === next.page)) return;
      positionRef.current = next;
      const left = segments[current.segment];
      // Moving on to a later chapter: the previous one was read to its end.
      if (left && next.segment > current.segment) {
        saver.record(left.number, left.pages.length - 1, left.pages.length);
      }
      const segment = segments[next.segment];
      if (segment) saver.record(segment.number, next.page, segment.pages.length);
      setPosition(next);
      if (nextState === 'idle' && shouldLoadNext(segments, next)) void loadNext();
    },
    [items, segments, saver, nextState, loadNext],
  );

  async function handlePageError(page: ReaderPage) {
    const segmentIndex = segments.findIndex((segment) => segment.pages.includes(page));
    const segment = segments[segmentIndex];
    if (!segment) return;
    if (!page.sourceId) {
      onFatalError('Image locale indisponible. Réimporte ou retélécharge ce chapitre.');
      return;
    }
    const failed = failedSources.current.get(segment.number) ?? new Set<string>();
    if (switching.current || failed.has(page.sourceId)) return;
    switching.current = true;
    failed.add(page.sourceId);
    failedSources.current.set(segment.number, failed);
    try {
      const binding = (await listBindings(entryId)).find((item) => item.sourceId === page.sourceId);
      if (binding) await markBindingHealth(binding.id, 'Image indisponible.');
      const replacement = await resolveChapterPages(
        entryId,
        segment.number,
        segment.sourceId,
        segment.chapterId,
        [...failed],
      );
      setSegments((current) =>
        current.map((item, itemIndex) =>
          itemIndex === segmentIndex ? { ...item, pages: replacement } : item,
        ),
      );
      successFeedback();
    } catch {
      onFatalError('Images indisponibles sur toutes les sources liées à ce chapitre.');
    } finally {
      switching.current = false;
    }
  }

  const current = segments[position.segment] ?? initial;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar hidden={!overlayVisible} animated />
      <WebtoonReader
        items={items}
        initialIndex={initialIndex}
        extraData={{ nextState, chapters }}
        onIndexChange={onIndexChange}
        onNearEnd={() => {
          if (nextState === 'idle') void loadNext();
        }}
        onTap={() => setOverlayVisible((visible) => !visible)}
        onScrollStart={() => setOverlayVisible(false)}
        onPageError={(page) => {
          void handlePageError(page);
        }}
        renderTransition={(item) => {
          const closed = segments[item.segment];
          const following = segments[item.segment + 1];
          const upcoming = chapters && closed ? nextChapter(chapters, closed.number) : null;
          const state: TransitionState = following
            ? 'ready'
            : chapters && !upcoming
              ? 'last'
              : nextState === 'failed'
                ? 'failed'
                : 'loading';
          return (
            <ChapterTransition
              finished={closed?.title ?? ''}
              next={following?.title ?? (upcoming ? chapterLabel(upcoming) : null)}
              state={state}
              minHeight={windowHeight * (following ? 0.22 : 0.35)}
              onPress={
                state === 'failed'
                  ? () => {
                      setNextState('idle');
                      void loadNext();
                    }
                  : undefined
              }
            />
          );
        }}
      />
      {overlayVisible ? (
        <View style={[styles.overlay, { paddingTop: insets.top, backgroundColor: theme.surface }]}>
          <ReaderToolbar
            title={current.title}
            counter={`${Math.min(position.page, current.pages.length - 1) + 1} / ${current.pages.length}`}
            paged={false}
            onToggleMode={() => onPaged(current, position.page)}
          />
        </View>
      ) : null}
    </View>
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
