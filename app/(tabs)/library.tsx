import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { listLibraryEntries, type LibraryEntry } from '../../db';
import { ActionButton } from '../../ui/components/ActionButton';
import { EmptyState } from '../../ui/components/EmptyState';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/useTheme';

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  useFocusEffect(useCallback(() => { void listLibraryEntries().then(setEntries); }, []));

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>MANGA READER</Text>
          <Text style={[styles.title, { color: theme.foreground }]}>Bibliothèque</Text>
        </View>
        <Text style={{ color: theme.secondary }}>{entries.length} mangas</Text>
      </View>
      <View style={styles.actions}>
        <ActionButton label="Importer un CBZ" icon="add" onPress={() => router.push('/import')} />
      </View>
      <FlashList data={entries} keyExtractor={(item) => item.id}
        contentContainerStyle={entries.length ? styles.list : styles.emptyList}
        ListEmptyComponent={<EmptyState icon="book-outline" title="Ta bibliothèque t’attend"
          detail="Importe un CBZ ou cherche un manga. Ta progression restera ici, même si une source disparaît." />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: '/entry/[id]', params: { id: item.id } })}
            style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={styles.cover}
              contentFit="cover" cachePolicy="disk" /> :
              <View style={[styles.cover, { backgroundColor: theme.border }]}>
                <Text style={{ color: theme.secondary, fontSize: 25 }}>✦</Text>
              </View>}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.foreground }]}>{item.canonicalTitle}</Text>
              <Text style={{ color: theme.secondary, marginTop: 5 }}>
                {item.lastReadAt ? 'Lecture en cours' : 'Pas encore lu'}
              </Text>
            </View>
            <Text style={{ color: theme.accent, fontSize: 22 }}>›</Text>
          </Pressable>
        )} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 5 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  actions: { marginTop: 24, paddingHorizontal: 20 },
  list: { gap: 10, padding: 20 }, emptyList: { flexGrow: 1, justifyContent: 'center' },
  row: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row',
    gap: 15, minHeight: 100, padding: 11 },
  cover: { alignItems: 'center', borderRadius: 9, height: 78, justifyContent: 'center', width: 55 },
  rowTitle: { fontSize: 16, fontWeight: '700' },
});
