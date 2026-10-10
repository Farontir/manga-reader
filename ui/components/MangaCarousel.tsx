import { Image } from 'expo-image';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { coverImageSource } from '../../services/coverImage';
import type { SourceManga } from '../../sources/types';
import { useTheme } from '../useTheme';

const SIZES = {
  featured: { width: 190, height: 272, title: 16 },
  regular: { width: 112, height: 160, title: 13 },
};

export function MangaCover({
  manga,
  variant = 'regular',
  busy = false,
  disabled = false,
  width,
  onPress,
}: {
  manga: SourceManga;
  variant?: keyof typeof SIZES;
  /** Fixed cover width (grids); the height follows the usual 1:1.43 cover ratio. */
  width?: number;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const size = width
    ? { width, height: Math.round(width * 1.43), title: SIZES.regular.title }
    : SIZES[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir ${manga.title}`}
      onPress={onPress}
      disabled={disabled}
      style={{ width: size.width }}
    >
      {manga.coverUrl ? (
        <Image
          source={coverImageSource(manga.coverUrl)}
          style={[styles.cover, { width: size.width, height: size.height }]}
          contentFit="cover"
        />
      ) : (
        <View
          style={[
            styles.cover,
            styles.placeholder,
            {
              width: size.width,
              height: size.height,
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={{ color: theme.secondary, fontSize: 28 }}>✦</Text>
        </View>
      )}
      {busy ? (
        <ActivityIndicator
          color={theme.accent}
          style={[styles.busy, { top: size.height / 2 - 10 }]}
        />
      ) : null}
      <Text
        numberOfLines={2}
        style={[styles.title, { color: theme.foreground, fontSize: size.title }]}
      >
        {manga.title}
      </Text>
    </Pressable>
  );
}

/** Horizontal row of covers; tapping one calls `onPress` with that manga. */
export function MangaCarousel({
  items,
  variant = 'regular',
  busyId,
  onPress,
}: {
  items: SourceManga[];
  variant?: keyof typeof SIZES;
  busyId?: string | null;
  onPress: (manga: SourceManga) => void;
}) {
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(manga) => manga.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      renderItem={({ item }) => (
        <MangaCover
          manga={item}
          variant={variant}
          busy={busyId === item.id}
          disabled={Boolean(busyId)}
          onPress={() => onPress(item)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { gap: 12, paddingHorizontal: 20 },
  cover: { borderRadius: 10 },
  placeholder: { alignItems: 'center', borderWidth: 1, justifyContent: 'center' },
  busy: { left: 0, position: 'absolute', right: 0 },
  title: { fontWeight: '700', lineHeight: 18, marginTop: 7 },
});
