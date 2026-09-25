import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { ReaderPage } from '../../services/readerPages';

type Props = { page: ReaderPage; paged: boolean; viewportHeight: number; onError?: () => void };

export function ZoomablePage({ page, paged, viewportHeight, onError }: Props) {
  const width = Dimensions.get('window').width;
  const [ratio, setRatio] = useState(1.45);
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = Math.min(3, Math.max(1, startScale.value * event.scale));
    })
    .onEnd(() => {
      if (scale.value < 1.05) scale.value = withTiming(1);
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withTiming(scale.value > 1.2 ? 1 : 2);
    });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const height = paged ? viewportHeight : width * ratio;

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, doubleTap)}>
      <View style={[styles.container, { width, height }]}>
        <Animated.View style={[styles.imageContainer, { width, height }, animatedStyle]}>
          <Image
            source={{ uri: page.uri, headers: page.headers }}
            style={{ width, height }}
            contentFit={paged ? 'contain' : 'fill'}
            cachePolicy="disk"
            onLoad={(event) => {
              if (event.source.width > 0) setRatio(event.source.height / event.source.width);
            }}
            onError={onError}
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
