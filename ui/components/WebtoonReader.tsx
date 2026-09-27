import { FlashList, type FlashListRef, type ViewToken } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useRef, useState, type Ref } from 'react';
import { PixelRatio, Pressable, useWindowDimensions } from 'react-native';

import type { ReaderPage } from '../../services/readerPages';
import { useReaderImage } from './useReaderImage';

// Height/width used until a strip has loaded; the list re-measures the real size.
const DEFAULT_RATIO = 1.45;
// Webtoon strips are often taller than the screen, so "60 % of the item visible" never
// happens: a page is current once it covers enough of the viewport instead.
const viewabilityConfig = { viewAreaCoveragePercentThreshold: 40 };

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
  listRef?: Ref<FlashListRef<ReaderPage>>;
  onIndexChange: (index: number) => void;
  onTap: () => void;
  onScrollStart: () => void;
  onPageError: (page: ReaderPage) => void;
};

/** Vertical, edge-to-edge strip reader: scrolling only, no horizontal page turn. */
export function WebtoonReader({
  pages,
  initialIndex,
  listRef,
  onIndexChange,
  onTap,
  onScrollStart,
  onPageError,
}: Props) {
  const { width, height } = useWindowDimensions();
  // Measured ratios survive item recycling, so a strip scrolled back into view keeps its size.
  const ratios = useRef(new Map<string, number>());
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ReaderPage>[] }) => {
      const first = viewableItems.find((item) => item.index !== null)?.index;
      if (first !== null && first !== undefined) onIndexChange(first);
    },
    [onIndexChange],
  );

  return (
    <FlashList
      ref={listRef}
      data={pages}
      keyExtractor={(item, index) => `${index}:${item.uri}`}
      initialScrollIndex={initialIndex}
      drawDistance={height * 2}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
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
