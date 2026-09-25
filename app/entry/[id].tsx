import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  deleteLibraryEntry, getLibraryEntry, listBindings, listKnownChapters,
  listLocalChapters, listProgress, type Chapter, type LibraryEntry,
  type LocalChapter, type Progress, type SourceBinding,
} from '../../db';
import { ActionButton } from '../../ui/components/ActionButton';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/useTheme';

type ChapterItem = { number: number; title: string; local: boolean; sourceId?: string; chapterId?: string };

function mergeChapters(local: LocalChapter[], remote: Chapter[], bindings: SourceBinding[]): ChapterItem[] {
  const items: ChapterItem[] = local.map((chapter) => ({
    number: chapter.chapterNumber, title: chapter.title, local: true,
  }));
  const priorities = new Map(bindings.map((binding) => [binding.sourceId, binding.priority]));
  for (const chapter of [...remote].sort((a, b) =>
    (priorities.get(b.sourceId) ?? 0) - (priorities.get(a.sourceId) ?? 0))) {
    if (!items.some((item) => item.number === chapter.number)) {
      items.push({ number: chapter.number, title: chapter.title ?? `Chapitre ${chapter.number}`,
        local: false, sourceId: chapter.sourceId, chapterId: chapter.chapterId });
    }
  }
  return items.sort((a, b) => b.number - a.number);
}

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [bindings, setBindings] = useState<SourceBinding[]>([]);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    void Promise.all([
      getLibraryEntry(id), listLocalChapters(id), listKnownChapters(id),
      listBindings(id), listProgress(id),
    ]).then(([nextEntry, local, remote, nextBindings, nextProgress]) => {
      setEntry(nextEntry); setBindings(nextBindings);
      setChapters(mergeChapters(local, remote, nextBindings)); setProgress(nextProgress);
    });
  }, [id]));

  function confirmDelete() {
    Alert.alert('Retirer ce manga ?', 'La progression et les fichiers associés seront supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => {
        void deleteLibraryEntry(id).then(() => router.replace('/(tabs)/library'));
      } },
    ]);
  }

  if (!entry) return <Screen><Text style={{ color: theme.secondary, padding: 24 }}>Chargement…</Text></Screen>;
  return (
    <Screen>
      <FlatList data={chapters} keyExtractor={(item) => `${item.number}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              {entry.coverUrl ? <Image source={{ uri: entry.coverUrl }} style={styles.cover} contentFit="cover" /> :
                <View style={[styles.cover, { backgroundColor: theme.border }]} />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.foreground }]}>{entry.canonicalTitle}</Text>
                <Text style={[styles.meta, { color: theme.secondary }]}>
                  {progress.length ? `${progress.filter((item) => item.completed).length} chapitres lus` : 'Aucune lecture'}
                </Text>
                <Text style={[styles.meta, { color: theme.secondary }]}>
                  {bindings.length} source{bindings.length > 1 ? 's' : ''} liée{bindings.length > 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            {entry.description ? <Text style={[styles.description, { color: theme.secondary }]}>{entry.description}</Text> : null}
            <ActionButton label="Importer un chapitre" icon="add" secondary onPress={() =>
              router.push({ pathname: '/import', params: { entryId: id } })} />
            <Text style={[styles.section, { color: theme.foreground }]}>Chapitres</Text>
            {!chapters.length ? <Text style={{ color: theme.secondary, marginBottom: 20 }}>
              Aucun chapitre. Importe un fichier ou relie une source.
            </Text> : null}
          </View>
        }
        renderItem={({ item }) => {
          const state = progress.find((record) => record.chapterNumber === item.number);
          return (
            <Pressable onPress={() => router.push({ pathname: '/reader/[id]', params: {
              id, chapter: String(item.number), sourceId: item.sourceId, chapterId: item.chapterId,
            } })} style={[styles.chapter, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.chapterTitle, { color: theme.foreground }]}>{item.title}</Text>
                <Text style={{ color: theme.secondary, marginTop: 4 }}>
                  {item.local ? 'Fichier local' : item.sourceId} · {state?.completed ? 'Lu' :
                    state ? `Page ${state.pageIndex + 1}` : 'Non lu'}
                </Text>
              </View>
              <Text style={{ color: theme.accent, fontSize: 22 }}>›</Text>
            </Pressable>
          );
        }}
        ListFooterComponent={<Pressable onPress={confirmDelete} style={styles.delete}>
          <Text style={{ color: theme.danger, textAlign: 'center' }}>Supprimer de la bibliothèque</Text>
        </Pressable>}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 20, paddingBottom: 50 }, hero: { flexDirection: 'row', gap: 18, marginBottom: 20 },
  cover: { borderRadius: 12, height: 150, width: 106 },
  title: { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  meta: { fontSize: 13, marginTop: 9 }, description: { fontSize: 14, lineHeight: 21, marginBottom: 20 },
  section: { fontSize: 20, fontWeight: '800', marginBottom: 12, marginTop: 32 },
  chapter: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row',
    marginBottom: 9, minHeight: 68, padding: 14 },
  chapterTitle: { fontSize: 15, fontWeight: '700' }, delete: { marginTop: 35, padding: 16 },
});
