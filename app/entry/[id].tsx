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
  setBindingPreferred,
  countChaptersBySource,
  setInLibrary,
  setSetting,
  type InstalledSource,
  type LibraryEntry,
  type Progress,
  type SourceBinding,
} from '../../db';
import { downloadChapter } from '../../services/downloads';
import { libraryCoverSource } from '../../services/appFiles';
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
  const [chapterCounts, setChapterCounts] = useState<Record<string, number>>({});

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
      countChaptersBySource(id),
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
        counts,
      ]) => {
        setEntry(nextEntry);
        setChapterCounts(counts);
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

  // Several sources can be preferred; with any, only their chapters are listed.
  async function togglePreferred(binding: SourceBinding) {
    selectionFeedback();
    await setBindingPreferred(binding.id, !binding.preferred);
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
                  source={libraryCoverSource(entry.coverUrl)}
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
                  Sources
                </Text>
                <Text style={[styles.sourcesHint, { color: theme.secondary }]}>
                  {bindings.some((binding) => binding.preferred)
                    ? 'Seuls les chapitres des sources préférées sont affichés.'
                    : 'Touche une ou plusieurs sources pour n’afficher que leurs chapitres.'}
                </Text>
                {bindings.map((binding) => {
                  const installed = sources.find((source) => source.id === binding.sourceId);
                  const count = chapterCounts[binding.sourceId] ?? 0;
                  return (
                    <Pressable
                      key={binding.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: binding.preferred }}
                      onPress={() => {
                        void togglePreferred(binding);
                      }}
                      style={[
                        styles.binding,
                        binding.preferred
                          ? { backgroundColor: theme.accent, borderColor: theme.accent }
                          : { backgroundColor: theme.surface, borderColor: theme.border },
                      ]}
                    >
                      <Ionicons
                        name={binding.preferred ? 'star' : 'star-outline'}
                        size={20}
                        color={binding.preferred ? theme.accentText : theme.secondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: binding.preferred ? theme.accentText : theme.foreground,
                            fontWeight: '700',
                          }}
                        >
                          {installed?.name ?? binding.sourceId}
                        </Text>
                        <Text
                          style={{
                            color: binding.preferred
                              ? theme.accentText
                              : binding.lastError
                                ? theme.danger
                                : theme.secondary,
                            marginTop: 3,
                          }}
                        >
                          {count} chapitre{count > 1 ? 's' : ''}
                          {!installed ? ' · désinstallée' : binding.lastError ? ' · en erreur' : ''}
                        </Text>
                      </View>
                      {binding.preferred ? (
                        <Text style={{ color: theme.accentText, fontWeight: '800', fontSize: 12 }}>
                          PRÉFÉRÉE
                        </Text>
                      ) : null}
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
  binding: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
    padding: 12,
  },
  sourcesHint: { fontSize: 13, lineHeight: 18, marginBottom: 10, marginTop: -6 },
});
