import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
  markChaptersRead,
  setBindingPreferred,
  countChaptersBySource,
  setInLibrary,
  setSensitiveOverride,
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
import { refreshEntryDetails } from '../../services/entryDetails';
import { detailsLine } from '../../services/mangaDetails';
import { relativeDate } from '../../services/relativeDate';
import { resumeTarget } from '../../services/resume';
import { isSensitive } from '../../services/sensitive';
import { ActionButton } from '../../ui/components/ActionButton';
import { Screen } from '../../ui/components/Screen';
import { selectionFeedback, successFeedback } from '../../ui/haptics';
import { useSensitiveGuard } from '../../ui/privacy';
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
  const [synopsisOpen, setSynopsisOpen] = useState(false);
  const detailsChecked = useRef(false);
  const initialChaptersChecked = useRef<string | null>(null);

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

  useEffect(() => {
    const missingSources = bindings
      .filter((binding) => (chapterCounts[binding.sourceId] ?? 0) === 0)
      .map((binding) => binding.sourceId)
      .sort();
    const checkKey = `${id}:${missingSources.join(',')}`;
    if (
      !id ||
      entry?.id !== id ||
      !bindings.length ||
      (chapters.length > 0 && !missingSources.length) ||
      initialChaptersChecked.current === checkKey
    )
      return;
    initialChaptersChecked.current = checkKey;
    setRefreshing(true);
    void refreshEntryChapters(id)
      .then(reload)
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [id, entry, bindings, chapterCounts, chapters.length, reload]);

  // Synopsis, genres… are fetched once per visit when missing or older than a week.
  useEffect(() => {
    if (!entry || detailsChecked.current) return;
    detailsChecked.current = true;
    void refreshEntryDetails(entry)
      .then((changed) => {
        if (changed) reload();
      })
      .catch(() => undefined);
  }, [entry, reload]);

  // Hidden again (locked in the background, or just marked sensitive): back to the library.
  const hidden = useSensitiveGuard(entry);

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

  // Long press on a chapter: read/unread, for it alone or for it and every earlier one.
  function showChapterActions(item: ChapterItem) {
    const completed = progress.some(
      (record) => record.chapterNumber === item.number && record.completed,
    );
    const upTo = chapters
      .filter((chapter) => chapter.number <= item.number)
      .map((chapter) => chapter.number);
    const actions: { label: string; numbers: number[]; read: boolean }[] = [
      { label: 'Marquer comme lu jusqu’ici', numbers: upTo, read: true },
      completed
        ? { label: 'Marquer comme non lu', numbers: [item.number], read: false }
        : { label: 'Marquer comme lu', numbers: [item.number], read: true },
      { label: 'Marquer comme non lu jusqu’ici', numbers: upTo, read: false },
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: labelOf(item),
        options: [...actions.map((action) => action.label), 'Annuler'],
        cancelButtonIndex: actions.length,
      },
      (index) => {
        const action = actions[index];
        if (!action) return;
        void markChaptersRead(id, action.numbers, action.read).then(() => {
          selectionFeedback();
          reload();
        });
      },
    );
  }

  // "⋯" menu: the user's own classification, which overrides the automatic one.
  function showActions() {
    if (!entry) return;
    const sensitive = isSensitive(entry);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [sensitive ? 'Marquer comme tout public' : 'Marquer comme sensible', 'Annuler'],
        cancelButtonIndex: 1,
      },
      (index) => {
        if (index !== 0) return;
        void setSensitiveOverride(entry.id, !sensitive).then(() => {
          selectionFeedback();
          reload();
        });
      },
    );
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

  if (!entry || hidden)
    return (
      <Screen>
        {hidden ? null : <Text style={{ color: theme.secondary, padding: 24 }}>Chargement…</Text>}
      </Screen>
    );
  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Plus d’actions"
                hitSlop={10}
                onPress={showActions}
              >
                <Ionicons name="ellipsis-horizontal-circle" size={25} color={theme.accent} />
              </Pressable>
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
            </View>
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
            {detailsLine(entry.details, entry.status) ? (
              <Text style={[styles.detailsLine, { color: theme.foreground }]}>
                {detailsLine(entry.details, entry.status)}
              </Text>
            ) : null}
            {entry.details?.authors.length ? (
              <Text style={[styles.authors, { color: theme.secondary }]}>
                Par {entry.details.authors.join(', ')}
              </Text>
            ) : null}
            {entry.details?.genres.length ? (
              <View style={styles.genres}>
                {entry.details.genres.map((genre) => (
                  <View
                    key={genre}
                    style={[
                      styles.genre,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                  >
                    <Text style={{ color: theme.foreground, fontSize: 12, fontWeight: '700' }}>
                      {genre}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {entry.description ? (
              <View style={styles.synopsis}>
                <Text style={[styles.sectionSmall, { color: theme.foreground }]}>Synopsis</Text>
                <Text
                  numberOfLines={synopsisOpen ? undefined : 4}
                  style={[styles.description, { color: theme.secondary }]}
                >
                  {entry.description}
                </Text>
                {entry.description.length > 180 ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setSynopsisOpen((open) => !open)}
                  >
                    <Text style={{ color: theme.accent, fontWeight: '700', marginTop: 4 }}>
                      {synopsisOpen ? 'Moins' : 'Plus'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
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
                {refreshing
                  ? 'Chargement des chapitres…'
                  : 'Aucun chapitre. Relie une source, ou importe un fichier depuis Réglages → Fichiers locaux.'}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const state = progress.find((record) => record.chapterNumber === item.number);
          const released = relativeDate(item.publishedAt);
          return (
            <Pressable
              onPress={() => openChapter(item.number)}
              onLongPress={() => showChapterActions(item)}
              style={[
                styles.chapter,
                { borderColor: theme.border, backgroundColor: theme.surface },
                // Read chapters are greyed out.
                state?.completed ? styles.chapterRead : null,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.chapterTitle,
                    { color: state?.completed ? theme.secondary : theme.foreground },
                  ]}
                >
                  {item.title}
                </Text>
                <Text style={{ color: theme.secondary, marginTop: 4 }}>
                  {[
                    released,
                    state?.completed ? 'Lu' : state ? `Page ${state.pageIndex + 1}` : 'Non lu',
                    downloading === item.number
                      ? `Téléchargement ${downloadProgress}`
                      : queued.has(item.number)
                        ? `Téléchargement en pause · ${queued.get(item.number)}`
                        : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {/* Download button in place of the chevron; local files show a folder. */}
              {item.local ? (
                <View accessibilityLabel="Fichier local" style={styles.chapterAction}>
                  <Ionicons name="folder-outline" size={22} color={theme.secondary} />
                </View>
              ) : downloaded.has(item.number) ? (
                <View accessibilityLabel="Disponible hors ligne" style={styles.chapterAction}>
                  <Ionicons name="checkmark-circle" size={24} color={theme.success} />
                </View>
              ) : downloading === item.number ? (
                <View style={styles.chapterAction}>
                  <ActivityIndicator color={theme.accent} />
                </View>
              ) : item.sourceId && item.chapterId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    queued.has(item.number) ? 'Reprendre le téléchargement' : 'Télécharger'
                  }
                  hitSlop={6}
                  onPress={() => {
                    void download(item);
                  }}
                  disabled={downloading !== null}
                  style={styles.chapterAction}
                >
                  <Ionicons
                    name={queued.has(item.number) ? 'cloud-download' : 'cloud-download-outline'}
                    size={24}
                    color={downloading !== null ? theme.secondary : theme.accent}
                  />
                </Pressable>
              ) : (
                <View style={styles.chapterAction} />
              )}
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
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 18 },
  chapterRead: { opacity: 0.55 },
  chapterAction: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  list: { padding: 20, paddingBottom: 50 },
  hero: { flexDirection: 'row', gap: 18, marginBottom: 20 },
  cover: { borderRadius: 12, height: 150, width: 106 },
  title: { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  meta: { fontSize: 13, marginTop: 9 },
  description: { fontSize: 14, lineHeight: 21 },
  detailsLine: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  authors: { fontSize: 13, marginBottom: 12 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  genre: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  synopsis: { marginBottom: 20 },
  sectionSmall: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
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
    // The download button brings its own spacing on the right.
    paddingRight: 6,
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
