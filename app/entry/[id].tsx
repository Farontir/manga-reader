import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getLibraryEntry,
  listBindings,
  listDownloadedChapters,
  listInstalledSources,
  listKnownChapters,
  listLocalChapters,
  listProgress,
  setBindingPriority,
  type Chapter,
  type InstalledSource,
  type LibraryEntry,
  type LocalChapter,
  type Progress,
  type SourceBinding,
} from '../../db';
import { downloadChapter } from '../../services/downloads';
import { removeEntryAndFiles } from '../../services/libraryFiles';
import { refreshEntryChapters } from '../../services/librarySources';
import { ActionButton } from '../../ui/components/ActionButton';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/useTheme';

type ChapterItem = {
  number: number;
  title: string;
  local: boolean;
  sourceId?: string;
  chapterId?: string;
};

function mergeChapters(
  local: LocalChapter[],
  remote: Chapter[],
  bindings: SourceBinding[],
): ChapterItem[] {
  const items: ChapterItem[] = local.map((chapter) => ({
    number: chapter.chapterNumber,
    title: chapter.title,
    local: true,
  }));
  const priorities = new Map(bindings.map((binding) => [binding.sourceId, binding.priority]));
  for (const chapter of [...remote].sort(
    (a, b) => (priorities.get(b.sourceId) ?? 0) - (priorities.get(a.sourceId) ?? 0),
  )) {
    if (!items.some((item) => item.number === chapter.number)) {
      items.push({
        number: chapter.number,
        title: chapter.title ?? `Chapitre ${chapter.number}`,
        local: false,
        sourceId: chapter.sourceId,
        chapterId: chapter.chapterId,
      });
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
  const [sources, setSources] = useState<InstalledSource[]>([]);
  const [downloaded, setDownloaded] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(() => {
    if (!id) return;
    void Promise.all([
      getLibraryEntry(id),
      listLocalChapters(id),
      listKnownChapters(id),
      listBindings(id),
      listProgress(id),
      listInstalledSources(),
      listDownloadedChapters(id),
    ]).then(([nextEntry, local, remote, nextBindings, nextProgress, nextSources, downloads]) => {
      setEntry(nextEntry);
      setBindings(nextBindings);
      setChapters(mergeChapters(local, remote, nextBindings));
      setProgress(nextProgress);
      setSources(nextSources);
      setDownloaded(new Set(downloads.map((item) => item.chapterNumber)));
    });
  }, [id]);
  useFocusEffect(reload);

  async function refresh() {
    setRefreshing(true);
    try {
      await refreshEntryChapters(id);
      reload();
    } catch (reason) {
      Alert.alert(
        'Actualisation impossible',
        reason instanceof Error ? reason.message : String(reason),
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function preferSource(binding: SourceBinding) {
    await setBindingPriority(binding.id, Math.max(...bindings.map((item) => item.priority), 0) + 1);
    reload();
  }

  async function download(item: ChapterItem) {
    if (!item.sourceId || !item.chapterId) return;
    setDownloading(item.number);
    try {
      await downloadChapter(id, item.number, item.sourceId, item.chapterId, (done, total) =>
        setDownloadProgress(`${done} / ${total}`),
      );
      reload();
    } catch (reason) {
      Alert.alert(
        'Téléchargement impossible',
        reason instanceof Error ? reason.message : String(reason),
      );
    } finally {
      setDownloading(null);
      setDownloadProgress('');
    }
  }

  function confirmDelete() {
    Alert.alert('Retirer ce manga ?', 'La progression et les fichiers associés seront supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void removeEntryAndFiles(id).then(() => router.replace('/(tabs)/library'));
        },
      },
    ]);
  }

  if (!entry)
    return (
      <Screen>
        <Text style={{ color: theme.secondary, padding: 24 }}>Chargement…</Text>
      </Screen>
    );
  return (
    <Screen>
      <FlatList
        data={chapters}
        keyExtractor={(item) => `${item.number}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              {entry.coverUrl ? (
                <Image source={{ uri: entry.coverUrl }} style={styles.cover} contentFit="cover" />
              ) : (
                <View style={[styles.cover, { backgroundColor: theme.border }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.foreground }]}>
                  {entry.canonicalTitle}
                </Text>
                <Text style={[styles.meta, { color: theme.secondary }]}>
                  {progress.length
                    ? `${progress.filter((item) => item.completed).length} chapitres lus`
                    : 'Aucune lecture'}
                </Text>
                <Text style={[styles.meta, { color: theme.secondary }]}>
                  {bindings.length} source{bindings.length > 1 ? 's' : ''} liée
                  {bindings.length > 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            {entry.description ? (
              <Text style={[styles.description, { color: theme.secondary }]}>
                {entry.description}
              </Text>
            ) : null}
            <ActionButton
              label="Importer un chapitre"
              icon="add"
              secondary
              onPress={() => router.push({ pathname: '/import', params: { entryId: id } })}
            />
            {bindings.length ? (
              <View style={{ marginTop: 24 }}>
                <Text style={[styles.section, { color: theme.foreground, marginTop: 0 }]}>
                  Sources liées
                </Text>
                {bindings.map((binding) => {
                  const installed = sources.find((source) => source.id === binding.sourceId);
                  return (
                    <Pressable
                      key={binding.id}
                      onPress={() => {
                        void preferSource(binding);
                      }}
                      style={[
                        styles.binding,
                        { backgroundColor: theme.surface, borderColor: theme.border },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.foreground, fontWeight: '700' }}>
                          {installed?.name ?? binding.sourceId}{' '}
                          {binding === bindings[0] ? '· préférée' : ''}
                        </Text>
                        <Text
                          style={{
                            color: binding.lastError ? theme.danger : theme.secondary,
                            marginTop: 3,
                          }}
                        >
                          {!installed
                            ? 'Désinstallée'
                            : binding.lastError
                              ? 'En erreur'
                              : 'Toucher pour privilégier'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
                <View style={{ marginTop: 9 }}>
                  <ActionButton
                    label={refreshing ? 'Actualisation…' : 'Actualiser les chapitres'}
                    icon="refresh-outline"
                    secondary
                    disabled={refreshing}
                    onPress={() => {
                      void refresh();
                    }}
                  />
                </View>
              </View>
            ) : null}
            <Text style={[styles.section, { color: theme.foreground }]}>Chapitres</Text>
            {!chapters.length ? (
              <Text style={{ color: theme.secondary, marginBottom: 20 }}>
                Aucun chapitre. Importe un fichier ou relie une source.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const state = progress.find((record) => record.chapterNumber === item.number);
          return (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/reader/[id]',
                  params: {
                    id,
                    chapter: String(item.number),
                    sourceId: item.sourceId,
                    chapterId: item.chapterId,
                  },
                })
              }
              style={[
                styles.chapter,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.chapterTitle, { color: theme.foreground }]}>{item.title}</Text>
                <Text style={{ color: theme.secondary, marginTop: 4 }}>
                  {item.local ? 'Fichier local' : item.sourceId} ·{' '}
                  {state?.completed ? 'Lu' : state ? `Page ${state.pageIndex + 1}` : 'Non lu'}
                </Text>
                {!item.local && item.sourceId && item.chapterId ? (
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      void download(item);
                    }}
                    disabled={downloading !== null || downloaded.has(item.number)}
                    style={{ marginTop: 8 }}
                  >
                    <Text
                      style={{
                        color: downloaded.has(item.number) ? theme.success : theme.accent,
                        fontSize: 12,
                        fontWeight: '700',
                      }}
                    >
                      {downloaded.has(item.number)
                        ? 'Disponible hors ligne'
                        : downloading === item.number
                          ? `Téléchargement ${downloadProgress}`
                          : 'Télécharger'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={{ color: theme.accent, fontSize: 22 }}>›</Text>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <Pressable onPress={confirmDelete} style={styles.delete}>
            <Text style={{ color: theme.danger, textAlign: 'center' }}>
              Supprimer de la bibliothèque
            </Text>
          </Pressable>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 20, paddingBottom: 50 },
  hero: { flexDirection: 'row', gap: 18, marginBottom: 20 },
  cover: { borderRadius: 12, height: 150, width: 106 },
  title: { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  meta: { fontSize: 13, marginTop: 9 },
  description: { fontSize: 14, lineHeight: 21, marginBottom: 20 },
  section: { fontSize: 20, fontWeight: '800', marginBottom: 12, marginTop: 32 },
  chapter: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 9,
    minHeight: 68,
    padding: 14,
  },
  chapterTitle: { fontSize: 15, fontWeight: '700' },
  delete: { marginTop: 35, padding: 16 },
  binding: { borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginBottom: 7, padding: 12 },
});
