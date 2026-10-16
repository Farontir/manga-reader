import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getProfileStats, type ProfileStats } from '../db';
import {
  formatDuration,
  rankFor,
  RANKS,
  readingStreak,
  topGenres,
  totalXp,
  XP_PER_CHAPTER,
  XP_PER_MANGA,
} from '../services/profile';
import { useShowSensitive } from '../ui/privacy';
import { useTheme } from '../ui/useTheme';

function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Reading statistics, XP and rank. */
export default function ProfileScreen() {
  const theme = useTheme();
  const showSensitive = useShowSensitive();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  useFocusEffect(
    useCallback(() => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      void getProfileStats({ includeSensitive: showSensitive, recentSince: weekAgo }).then(
        setStats,
      );
    }, [showSensitive]),
  );

  const xp = stats ? totalXp(stats.chaptersRead, stats.mangaCompleted) : 0;
  const rank = rankFor(xp);
  const streak = stats ? readingStreak(stats.readingDays, localDay(new Date())) : 0;
  const genres = stats ? topGenres(stats.manga) : [];
  const tiles: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }[] = [
    {
      icon: 'time-outline',
      value: formatDuration(stats?.totalSeconds ?? 0),
      label: 'de lecture au total',
    },
    {
      icon: 'calendar-outline',
      value: formatDuration(stats?.recentSeconds ?? 0),
      label: 'ces 7 derniers jours',
    },
    { icon: 'book-outline', value: String(stats?.chaptersRead ?? 0), label: 'chapitres lus' },
    {
      icon: 'checkmark-done-outline',
      value: String(stats?.mangaCompleted ?? 0),
      label: 'mangas terminés',
    },
    {
      icon: 'flame-outline',
      value: `${streak} jour${streak > 1 ? 's' : ''}`,
      label: 'de lecture d’affilée',
    },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.rankCard, { backgroundColor: theme.accent }]}>
        <Text style={[styles.level, { color: theme.accentText }]}>
          RANG {rank.level} / {RANKS.length}
        </Text>
        <Text style={[styles.rank, { color: theme.accentText }]}>{rank.rank}</Text>
        <Text style={{ color: theme.accentText, fontWeight: '700', marginTop: 2 }}>
          {xp.toLocaleString('fr-FR')} XP
        </Text>
        <View style={[styles.bar, { backgroundColor: theme.background }]}>
          <View
            style={[
              styles.barFill,
              { backgroundColor: theme.accentText, width: `${Math.round(rank.progress * 100)}%` },
            ]}
          />
        </View>
        <Text style={{ color: theme.accentText, fontSize: 13, marginTop: 8 }}>
          {rank.next
            ? `Encore ${rank.remaining.toLocaleString('fr-FR')} XP pour devenir ${rank.next}`
            : 'Rang maximal atteint'}
        </Text>
      </View>
      <Text style={[styles.hint, { color: theme.secondary }]}>
        +{XP_PER_CHAPTER} XP par chapitre lu, +{XP_PER_MANGA} XP par manga terminé.
      </Text>

      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <View
            key={tile.label}
            style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Ionicons name={tile.icon} size={20} color={theme.accent} />
            <Text style={[styles.tileValue, { color: theme.foreground }]}>{tile.value}</Text>
            <Text style={{ color: theme.secondary, fontSize: 12 }}>{tile.label}</Text>
          </View>
        ))}
      </View>

      {genres.length ? (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.foreground }]}>Genres préférés</Text>
          {genres.map((item) => (
            <View key={item.genre} style={styles.genreRow}>
              <Text style={{ color: theme.foreground, flex: 1, fontSize: 15 }}>{item.genre}</Text>
              <Text style={{ color: theme.secondary, fontSize: 13 }}>
                {item.chapters} chapitre{item.chapters > 1 ? 's' : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.foreground }]}>Rangs</Text>
        {RANKS.map((item, index) => {
          const reached = xp >= item.xp;
          return (
            <View key={item.name} style={styles.genreRow}>
              <Ionicons
                name={reached ? 'ribbon' : 'ribbon-outline'}
                size={18}
                color={reached ? theme.accent : theme.secondary}
              />
              <Text
                style={{
                  color: reached ? theme.foreground : theme.secondary,
                  flex: 1,
                  fontSize: 15,
                  fontWeight: index + 1 === rank.level ? '800' : '400',
                }}
              >
                {item.name}
              </Text>
              <Text style={{ color: theme.secondary, fontSize: 13 }}>
                {item.xp.toLocaleString('fr-FR')} XP
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: theme.secondary }]}>
        Le temps de lecture est compté depuis la version 1.0.9, seulement quand tu tournes les
        pages.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 20, paddingBottom: 45 },
  rankCard: { borderRadius: 20, padding: 20 },
  level: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  rank: { fontSize: 30, fontWeight: '800', marginTop: 4 },
  bar: { borderRadius: 4, height: 8, marginTop: 14, overflow: 'hidden' },
  barFill: { borderRadius: 4, height: 8 },
  hint: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { borderRadius: 14, borderWidth: 1, flexBasis: '47%', flexGrow: 1, gap: 4, padding: 14 },
  tileValue: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  card: { borderRadius: 16, borderWidth: 1, gap: 10, padding: 16 },
  cardTitle: { fontSize: 17, fontWeight: '800', marginBottom: 2 },
  genreRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
});
