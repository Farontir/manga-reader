import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getLibraryEntry,
  getSetting,
  listDownloadJobs,
  listBindings,
  listDownloadedChapters,
  listInstalledSources,
  listKnownChapters,
  listLocalChapters,
  listProgress,
  setBindingPriority,
  setInLibrary,
  setSetting,
  type InstalledSource,
  type LibraryEntry,
  type Progress,
  type SourceBinding,
} from '../../db';
import { downloadChapter } from '../../services/downloads';
import { coverImageSource } from '../../services/coverImage';
import { removeEntryAndFiles } from '../../services/libraryFiles';
import {
  chapterLabel as labelOf,
  mergeChapters,
  type ChapterItem,
} from '../../services/chapterList';
import { refreshEntryChapters } from '../../services/librarySources';
import { resumeTarget } from '../../services/resume';
import { ActionButton } from '../../ui/components/ActionButton';
import { Screen } from '../../ui/components/Screen';
import { selectionFeedback, successFeedback } from '../../ui/haptics';
import { useTheme } from '../../ui/useTheme';

const CHAPTER_ORDER_KEY = 'chapters.order';

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
  const [queued, setQueued] = useState<Map<number, string>>(new Map());
  const [downloading, setDownloading] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [ascending, setAscending] = useState(false);

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
      listDownloadJobs(id),
      getSetting(CHAPTER_ORDER_KEY),
    ]).then(
      ([
        nextEntry,
        local,
        remote,
        nextBindings,
        nextProgress,
        nextSources,
        downloads,
        jobs,
        order,
      ]) => {
        setEntry(nextEntry);
        setAscending(order === 'asc');
        setBindings(nextBindings);
        setChapters(mergeChapters(local, remote, nextBindings));
        setProgress(nextProgress);
        setSources(nextSources);
        setDownloaded(new Set(downloads.map((item) => item.chapterNumber)));
        setQueued(
          new Map(jobs.map((job) => [job.chapterNumber, `${job.nextPage} / ${job.pages.length}`])),
        );
      },
    );
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

  function toggleOrder() {
    const next = !ascending;
    setAscending(next);
    void setSetting(CHAPTER_ORDER_KEY, next ? 'asc' : 'desc');
  }

  function openChapter(number: number) {
    const item = chapters.find((chapter) => chapter.number === number);
    router.push({
      pathname: '/reader/[id]',
      params: {
        id,
        chapter: String(number),
        sourceId: item?.sourceId,
        chapterId: item?.chapterId,
      },
    });
  }

  function chapterLabel(number: number) {
    const item = chapters.find((chapter) => chapter.number === number);
    return item ? labelOf(item) : `Chapitre ${number}`;
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

  async function toggleBookmark() {
    if (!entry) return;
    const next = !entry.inLibrary;
    setEntry({ ...entry, inLibrary: next });
    if (next) successFeedback();
    else selectionFeedback();
    try {
      await setInLibrary(entry.id, next);
    } catch (reason) {
      setEntry({ ...entry, inLibrary: !next });
      Alert.alert('Signet impossible', reason instanceof Error ? reason.message : String(reason));
    }
  }

  function confirmDelete() {
    Alert.alert('Effacer ce manga ?', 'La progression et les fichiers associés seront supprimés.', [
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

  const resume = resumeTarget(
    chapters.map((chapter) => chapter.number),
    progress,
  );
  const shownChapters = ascending ? [...chapters].reverse() : chapters;

  if (!entry)
    return (
      <Screen>
        <Text style={{ color: theme.secondary, padding: 24 }}>Chargement…</Text>
      </Screen>
    );
  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                entry.inLibrary ? 'Retirer de la bibliothèque' : 'Ajouter à la bibliothèque'
              }
              accessibilityState={{ selected: entry.inLibrary }}
              hitSlop={10}
              onPress={() => {
                void toggleBookmark();
              }}
            >
              <Ionicons
                name={entry.inLibrary ? 'bookmark' : 'bookmark-outline'}
                size={24}
                color={theme.accent}
              />
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={shownChapters}
        keyExtractor={(item) => `${item.number}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              {entry.coverUrl ? (
                <Image
                  source={coverImageSource(entry.coverUrl)}
                  style={styles.cover}
                  contentFit="cover"
                />
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
            {resume && resume.kind !== 'upToDate' ? (
              <View style={styles.resume}>
                <ActionButton
                  label={
                    resume.kind === 'resume'
                      ? `Reprendre · ${chapterLabel(resume.chapterNumber)} · p. ${resume.pageIndex + 1}`
                      : `${resume.kind === 'next' ? 'Continuer' : 'Commencer'} · ${chapterLabel(resume.chapterNumber)}`
                  }
                  icon="play"
                  onPress={() => openChapter(resume.chapterNumber)}
                />
              </View>
            ) : resume ? (
              <Text style={[styles.upToDate, { color: theme.success }]}>
                À jour · {chapterLabel(resume.chapterNumber)} lu
              </Text>
            ) : null}
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
            <View style={styles.sectionRow}>
              <Text style={[styles.section, { color: theme.foreground, marginBottom: 0 }]}>
                Chapitres
              </Text>
              {chapters.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Inverser l’ordre des chapitres"
                  onPress={toggleOrder}
                  style={styles.orderButton}
                >
                  <Ionicons name="swap-vertical" size={17} color={theme.accent} />
                  <Text style={{ color: theme.accent, fontWeight: '700' }}>
                    {ascending ? 'Plus anciens d’abord' : 'Plus récents d’abord'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {!chapters.length ? (
              <Text style={{ color: theme.secondary, marginBottom: 20 }}>
                Aucun chapitre. Relie une source, ou importe un fichier depuis Réglages → Fichiers
                locaux.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const state = progress.find((record) => record.chapterNumber === item.number);
          return (
            <Pressable
              onPress={() => openChapter(item.number)}
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
                          : queued.has(item.number)
                            ? `Reprendre · ${queued.get(item.number)}`
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
              Effacer ce manga et sa progression
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
  sectionRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  orderButton: { alignItems: 'center', flexDirection: 'row', gap: 5, paddingVertical: 4 },
  resume: { marginBottom: 10 },
  upToDate: { fontSize: 14, fontWeight: '700', marginBottom: 14 },
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
