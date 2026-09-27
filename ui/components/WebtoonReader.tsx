import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useRef, useState, type ReactElement } from 'react';
import {
  PixelRatio,
  Pressable,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { ReaderPage } from '../../services/readerPages';
import { useReaderImage } from './useReaderImage';
import { pageAtScroll } from './webtoonPosition';

// Height/width used until a strip has loaded; the list re-measures the real size.
const DEFAULT_RATIO = 1.45;

type PageProps = {
  page: ReaderPage;
  width: number;
  initialRatio: number;
  onRatio: (ratio: number) => void;
  onPress: () => void;
  onError: () => void;
};

function WebtoonPage({ page, width, initialRatio, onRatio, onPress, onError }: PageProps) {
  const [ratio, setRatio] = useState(initialRatio);
  const { source, handleError } = useReaderImage(page, onError);
  const height = PixelRatio.roundToNearestPixel(width * ratio);
  return (
    <Pressable onPress={onPress} accessibilityRole="image">
      <Image
        source={source}
        style={{ width, height }}
        contentFit="fill"
        cachePolicy="none"
        onLoad={(event) => {
          if (event.source.width <= 0) return;
          const next = event.source.height / event.source.width;
          setRatio(next);
          onRatio(next);
        }}
        onError={handleError}
      />
    </Pressable>
  );
}

type Props = {
  pages: ReaderPage[];
  initialIndex: number;
  onIndexChange: (index: number) => void;
  onTap: () => void;
  onScrollStart: () => void;
  onPageError: (page: ReaderPage) => void;
  /** Shown under the last strip (end of chapter). */
  footer?: ReactElement;
  /** The user stopped scrolling at the very bottom of the list. */
  onReachEnd?: () => void;
};

/** Vertical, edge-to-edge strip reader: scrolling only, no horizontal page turn. */
export function WebtoonReader({
  pages,
  initialIndex,
  onIndexChange,
  onTap,
  onScrollStart,
  onPageError,
  footer,
  onReachEnd,
}: Props) {
  const { width, height } = useWindowDimensions();
  // Measured ratios survive item recycling, so a strip scrolled back into view keeps its size.
  const ratios = useRef(new Map<string, number>());
  const listRef = useRef<FlashListRef<ReaderPage>>(null);

  // The current page comes from the scroll position and the measured strip layouts:
  // viewability callbacks lag 250 ms and never reach a short last page.
  function trackPage(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const list = listRef.current;
    if (!list) return;
    const firstOffset = list.getFirstItemOffset();
    const page = pageAtScroll(
      pages.length,
      (index) => list.getLayout(index),
      contentOffset.y - firstOffset,
      layoutMeasurement.height,
      contentSize.height - firstOffset,
    );
    if (page !== null) onIndexChange(page);
  }

  function settle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    trackPage(event);
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 2) onReachEnd?.();
  }

  return (
    <FlashList
      ref={listRef}
      data={pages}
      keyExtractor={(item, index) => `${index}:${item.uri}`}
      initialScrollIndex={initialIndex}
      drawDistance={height * 2}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      onScroll={trackPage}
      // A release without momentum only fires onScrollEndDrag.
      onScrollEndDrag={settle}
      onMomentumScrollEnd={settle}
      ListFooterComponent={footer}
      scrollEventThrottle={100}
      onScrollBeginDrag={onScrollStart}
      renderItem={({ item }) => (
        <WebtoonPage
          key={JSON.stringify([item.uri, item.headers])}
          page={item}
          width={width}
          initialRatio={ratios.current.get(item.uri) ?? DEFAULT_RATIO}
          onRatio={(ratio) => ratios.current.set(item.uri, ratio)}
          onPress={onTap}
          onError={() => onPageError(item)}
        />
      )}
    />
  );
}
