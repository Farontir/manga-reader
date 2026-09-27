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

import type { FeedItem } from '../../services/readerFeed';
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
  /** Pages of one or more chapters, each chapter closed by a transition item. */
  items: FeedItem[];
  initialIndex: number;
  onIndexChange: (index: number) => void;
  onTap: () => void;
  onScrollStart: () => void;
  onPageError: (page: ReaderPage) => void;
  renderTransition: (item: Extract<FeedItem, { kind: 'transition' }>) => ReactElement;
  /** Re-renders items (transitions) when state outside `items` changes. */
  extraData?: unknown;
  /** Less than two screens of content left: time to append the next chapter. */
  onNearEnd?: () => void;
};

/**
 * Vertical, edge-to-edge strip reader: scrolling only, no horizontal page turn. Chapters
 * appended to `items` continue the same list, so reading flows from one to the next.
 */
export function WebtoonReader({
  items,
  initialIndex,
  onIndexChange,
  onTap,
  onScrollStart,
  onPageError,
  renderTransition,
  extraData,
  onNearEnd,
}: Props) {
  const { width, height } = useWindowDimensions();
  // Measured ratios survive item recycling, so a strip scrolled back into view keeps its size.
  const ratios = useRef(new Map<string, number>());
  const listRef = useRef<FlashListRef<FeedItem>>(null);

  // The current item comes from the scroll position and the measured layouts: viewability
  // callbacks lag 250 ms and never reach a short last page.
  function trackPosition(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const list = listRef.current;
    if (!list) return;
    const firstOffset = list.getFirstItemOffset();
    const index = pageAtScroll(
      items.length,
      (itemIndex) => list.getLayout(itemIndex),
      contentOffset.y - firstOffset,
      layoutMeasurement.height,
      contentSize.height - firstOffset,
    );
    if (index !== null) onIndexChange(index);
  }

  return (
    <FlashList
      ref={listRef}
      data={items}
      keyExtractor={(item) => item.key}
      getItemType={(item) => item.kind}
      extraData={extraData}
      onEndReached={onNearEnd}
      onEndReachedThreshold={2}
      initialScrollIndex={initialIndex}
      drawDistance={height * 2}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      onScroll={trackPosition}
      onScrollEndDrag={trackPosition}
      onMomentumScrollEnd={trackPosition}
      scrollEventThrottle={100}
      onScrollBeginDrag={onScrollStart}
      renderItem={({ item }) =>
        item.kind === 'transition' ? (
          renderTransition(item)
        ) : (
          <WebtoonPage
            key={JSON.stringify([item.data.uri, item.data.headers])}
            page={item.data}
            width={width}
            initialRatio={ratios.current.get(item.data.uri) ?? DEFAULT_RATIO}
            onRatio={(ratio) => ratios.current.set(item.data.uri, ratio)}
            onPress={onTap}
            onError={() => onPageError(item.data)}
          />
        )
      }
    />
  );
}
