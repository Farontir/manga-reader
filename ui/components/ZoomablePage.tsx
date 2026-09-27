import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ReaderPage } from '../../services/readerPages';
import { useReaderImage } from './useReaderImage';

type Props = {
  page: ReaderPage;
  paged: boolean;
  viewportHeight: number;
  onError?: () => void;
  onZoomChange?: (zoomed: boolean) => void;
  /** Paged mode: dragging a zoomed page past its edge turns to the neighbouring page. */
  onEdgeSwipe?: (direction: EdgeDirection) => void;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
};

export type EdgeDirection = 'previous' | 'next';

// Drag beyond the edge (px) or flick speed (px/s) that turns the page while zoomed.
const EDGE_FLIP_DISTANCE = 80;
const EDGE_FLIP_VELOCITY = 900;
// Share of the overshoot shown on screen, so the page visibly resists at its edge.
const EDGE_RESISTANCE = 0.4;

function translationLimit(imageSize: number, viewportSize: number, scale: number) {
  'worklet';
  return Math.max(0, (imageSize * scale - viewportSize) / 2);
}

function clampTranslation(value: number, imageSize: number, viewportSize: number, scale: number) {
  'worklet';
  const limit = translationLimit(imageSize, viewportSize, scale);
  return Math.max(-limit, Math.min(limit, value));
}

/** Clamps like `clampTranslation`, but lets the page stretch past an edge that can turn. */
function resistTranslation(value: number, limit: number, previous: boolean, next: boolean) {
  'worklet';
  if (value > limit) return previous ? limit + (value - limit) * EDGE_RESISTANCE : limit;
  if (value < -limit) return next ? -limit + (value + limit) * EDGE_RESISTANCE : -limit;
  return value;
}

export function ZoomablePage({
  page,
  paged,
  viewportHeight,
  onError,
  onZoomChange,
  onEdgeSwipe,
  canGoPrevious = false,
  canGoNext = false,
}: Props) {
  const width = Dimensions.get('window').width;
  const [ratio, setRatio] = useState(1.45);
  const [panEnabled, setPanEnabled] = useState(false);
  const { source, handleError } = useReaderImage(page, onError);
  const height = paged ? viewportHeight : width * ratio;
  const imageWidth = paged ? Math.min(width, height / ratio) : width;
  const imageHeight = paged ? imageWidth * ratio : height;
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const isZoomed = useSharedValue(false);
  const updateZoomed = (next: boolean) => {
    'worklet';
    if (isZoomed.value !== next) {
      isZoomed.value = next;
      scheduleOnRN(setPanEnabled, next);
      if (onZoomChange) scheduleOnRN(onZoomChange, next);
    }
  };
  const canTurnPrevious = paged && canGoPrevious && Boolean(onEdgeSwipe);
  const canTurnNext = paged && canGoNext && Boolean(onEdgeSwipe);
  const turnPage = (direction: EdgeDirection) => {
    'worklet';
    scale.value = withTiming(1, { duration: 150 });
    translateX.value = withTiming(0, { duration: 150 });
    translateY.value = withTiming(0, { duration: 150 });
    updateZoomed(false);
    if (onEdgeSwipe) scheduleOnRN(onEdgeSwipe, direction);
  };
  const pinch = Gesture.Pinch()
    .onStart((event) => {
      startScale.value = scale.value;
      startX.value = translateX.value;
      startY.value = translateY.value;
      focalX.value = event.focalX;
      focalY.value = event.focalY;
    })
    .onUpdate((event) => {
      const next = Math.min(4, Math.max(1, startScale.value * event.scale));
      const factor = next / startScale.value;
      scale.value = next;
      translateX.value = clampTranslation(
        startX.value +
          (event.focalX - focalX.value) +
          (1 - factor) * (focalX.value - width / 2 - startX.value),
        imageWidth,
        width,
        next,
      );
      translateY.value = clampTranslation(
        startY.value +
          (event.focalY - focalY.value) +
          (1 - factor) * (focalY.value - height / 2 - startY.value),
        imageHeight,
        height,
        next,
      );
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        updateZoomed(false);
      } else {
        updateZoomed(true);
      }
    });
  const pan = Gesture.Pan()
    .enabled(panEnabled)
    .maxPointers(1)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateX.value = resistTranslation(
        startX.value + event.translationX,
        translationLimit(imageWidth, width, scale.value),
        canTurnPrevious,
        canTurnNext,
      );
      translateY.value = clampTranslation(
        startY.value + event.translationY,
        imageHeight,
        height,
        scale.value,
      );
    })
    .onEnd((event) => {
      const limit = translationLimit(imageWidth, width, scale.value);
      const overshoot = Math.abs(startX.value + event.translationX) - limit;
      const pulled =
        overshoot > EDGE_FLIP_DISTANCE ||
        (overshoot > 20 && Math.abs(event.velocityX) > EDGE_FLIP_VELOCITY);
      // Content dragged left past its right edge reveals the next page, and vice versa.
      if (pulled && canTurnNext && startX.value + event.translationX < 0) turnPage('next');
      else if (pulled && canTurnPrevious && startX.value + event.translationX > 0)
        turnPage('previous');
      else
        translateX.value = withTiming(
          clampTranslation(translateX.value, imageWidth, width, scale.value),
        );
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      const next = scale.value > 1.2 ? 1 : 2;
      scale.value = withTiming(next);
      translateX.value = withTiming(
        next === 1
          ? 0
          : clampTranslation((1 - next) * (event.x - width / 2), imageWidth, width, next),
      );
      translateY.value = withTiming(
        next === 1
          ? 0
          : clampTranslation((1 - next) * (event.y - height / 2), imageHeight, height, next),
      );
      updateZoomed(next > 1);
    });
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <View style={[styles.container, { width, height }]}>
        <Animated.View
          style={[styles.imageContainer, { width: imageWidth, height: imageHeight }, animatedStyle]}
        >
          <Image
            source={source}
            style={{ width: imageWidth, height: imageHeight }}
            contentFit="contain"
            cachePolicy="none"
            onLoad={(event) => {
              if (event.source.width > 0) setRatio(event.source.height / event.source.width);
            }}
            onError={handleError}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  imageContainer: { alignItems: 'center', justifyContent: 'center' },
});
