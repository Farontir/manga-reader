import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActionSheetIOS, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { hideFromHistory, listHistory, type HistoryItem } from '../../db';
import { libraryCoverSource } from '../../services/appFiles';
import { groupByDay } from '../../services/historyGroups';
import { EmptyState } from '../../ui/components/EmptyState';
import { Screen } from '../../ui/components/Screen';
import { selectionFeedback } from '../../ui/haptics';
import { useShowSensitive } from '../../ui/privacy';
import { useTheme } from '../../ui/useTheme';

function chapterText(item: HistoryItem): string {
  const chapter = `Chapitre ${item.chapterNumber}`;
  if (item.completed) return `${chapter} · terminé`;
  return item.totalPages
    ? `${chapter} · page ${item.pageIndex + 1}/${item.totalPages}`
    : `${chapter} · page ${item.pageIndex + 1}`;
}

function timeText(value: string): string {
  const date = new Date(value);
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Last chapters opened, grouped by day; a tap resumes reading. */
export default function HistoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const showSensitive = useShowSensitive();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const reload = useCallback(() => {
    void listHistory({ includeSensitive: showSensitive }).then(setItems);
  }, [showSensitive]);
  useFocusEffect(reload);
  const sections = useMemo(() => groupByDay(items), [items]);

  function showActions(item: HistoryItem) {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `${item.title} · Chapitre ${item.chapterNumber}`,
        options: ['Voir le manga', 'Retirer de l’historique', 'Annuler'],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) router.push({ pathname: '/entry/[id]', params: { id: item.entryId } });
        if (index === 1) {
          void hideFromHistory(item.entryId, item.chapterNumber).then(() => {
            selectionFeedback();
            reload();
          });
        }
      },
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground }]}>Historique</Text>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.entryId}:${item.chapterNumber}`}
        contentContainerStyle={sections.length ? styles.list : styles.emptyList}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <EmptyState
            icon="time-outline"
            title="Aucune lecture pour l’instant"
            detail="Les chapitres que tu ouvres apparaîtront ici, du plus récent au plus ancien."
          />
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.day, { color: theme.secondary }]}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${chapterText(item)}`}
            onPress={() =>
              router.push({
                pathname: '/reader/[id]',
                params: { id: item.entryId, chapter: String(item.chapterNumber) },
              })
            }
            onLongPress={() => showActions(item)}
            style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            {item.coverUrl ? (
              <Image
                source={libraryCoverSource(item.coverUrl)}
                style={[styles.cover, { backgroundColor: theme.border }]}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : (
              <View style={[styles.cover, { backgroundColor: theme.border }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.foreground }]}>
                {item.title}
              </Text>
              <Text style={{ color: theme.secondary, fontSize: 13, marginTop: 4 }}>
                {chapterText(item)}
              </Text>
            </View>
            <View style={styles.side}>
              <Text style={{ color: theme.secondary, fontSize: 12 }}>{timeText(item.readAt)}</Text>
              <Ionicons name="play-circle" size={26} color={theme.accent} />
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 20 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  list: { gap: 8, padding: 20, paddingTop: 6 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  day: { fontSize: 13, fontWeight: '800', marginBottom: 2, marginTop: 14 },
  row: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 10,
  },
  cover: { borderRadius: 7, height: 64, width: 45 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  side: { alignItems: 'flex-end', gap: 6 },
});
