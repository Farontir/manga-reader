import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { coverImageSource } from '../../services/coverImage';
import type { SearchResult } from '../useGlobalSearch';
import { useTheme } from '../useTheme';

/** One grouped search result: cover, title and who offers it (AniList · sources). */
export function SearchResultRow({
  result,
  busy,
  disabled,
  onPress,
}: {
  result: SearchResult;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.result, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      {result.coverUrl ? (
        <Image source={coverImageSource(result.coverUrl)} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, { backgroundColor: theme.border }]} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: theme.foreground }]} numberOfLines={2}>
          {result.title}
        </Text>
        <Text numberOfLines={1} style={{ color: theme.secondary, marginTop: 5, fontSize: 12 }}>
          {[
            ...(result.anilist ? ['AniList'] : []),
            ...result.sources.map((entry) => entry.source.name),
          ].join(' · ')}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator color={theme.accent} />
      ) : (
        <Ionicons name="chevron-forward" size={22} color={theme.secondary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  result: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 91,
    padding: 10,
  },
  cover: { borderRadius: 7, height: 67, width: 47 },
  title: { fontSize: 15, fontWeight: '700' },
});
