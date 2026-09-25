import * as BackgroundTask from 'expo-background-task';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as TaskManager from 'expo-task-manager';

import {
  deleteDownloadJob,
  getDownloadedChapter,
  listDownloadJobs,
  putDownloadedChapter,
  putDownloadJob,
  setDownloadJobPage,
  type DownloadJob,
} from '../db';
import { resolveChapterPages } from './readerPages';

const taskName = 'manga-reader-downloads';
const listeners = new Map<string, (done: number, total: number) => void>();
let processing: Promise<Map<string, Error>> | null = null;

function key(entryId: string, chapterNumber: number): string {
  return `${entryId}:${chapterNumber}`;
}

function extensionFor(url: string): string {
  const match = new URL(url).pathname.match(/\.(jpg|jpeg|png|webp|avif)$/i);
  return match?.[1]?.toLowerCase() ?? 'jpg';
}

function pageFile(directory: Directory, page: DownloadJob['pages'][number], index: number): File {
  return new File(directory, `${String(index + 1).padStart(5, '0')}.${extensionFor(page.uri)}`);
}

async function ensureBackgroundTask(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (!(await TaskManager.isTaskRegisteredAsync(taskName))) {
      await BackgroundTask.registerTaskAsync(taskName, { minimumInterval: 15 });
    }
  } catch {
    // Foreground downloads still work when background execution is unavailable.
  }
}

async function processJob(job: DownloadJob): Promise<void> {
  const directory = new Directory(
    Paths.document,
    'downloads',
    job.libraryEntryId,
    String(job.chapterNumber),
  );
  directory.create({ idempotent: true, intermediates: true });
  for (let index = 0; index < job.pages.length; index += 1) {
    const page = job.pages[index];
    if (!page) throw new Error('Page manquante dans la file de téléchargement.');
    const target = pageFile(directory, page, index);
    if (index < job.nextPage && target.exists && target.size > 0) {
      listeners.get(key(job.libraryEntryId, job.chapterNumber))?.(index + 1, job.pages.length);
      continue;
    }
    if (index < job.nextPage) {
      job.nextPage = index;
      await setDownloadJobPage(job.libraryEntryId, job.chapterNumber, index);
    }
    const download = LegacyFileSystem.createDownloadResumable(page.uri, target.uri, {
      headers: page.headers,
      sessionType: LegacyFileSystem.FileSystemSessionType.BACKGROUND,
    });
    const result = await download.downloadAsync();
    if (!result || result.status < 200 || result.status >= 300 || !target.exists) {
      if (target.exists) target.delete();
      throw new Error(`Échec du téléchargement de la page ${index + 1}.`);
    }
    job.nextPage = index + 1;
    await setDownloadJobPage(job.libraryEntryId, job.chapterNumber, job.nextPage);
    listeners.get(key(job.libraryEntryId, job.chapterNumber))?.(job.nextPage, job.pages.length);
  }
  const files = job.pages.map((page, index) => pageFile(directory, page, index));
  if (files.some((file) => !file.exists || file.size < 1)) {
    throw new Error('Téléchargement incomplet. La reprise est possible.');
  }
  await putDownloadedChapter({
    libraryEntryId: job.libraryEntryId,
    chapterNumber: job.chapterNumber,
    sourceId: job.sourceId,
    pageUris: files.map((file) => file.uri),
    downloadedAt: new Date().toISOString(),
    sizeBytes: files.reduce((size, file) => size + file.size, 0),
  });
  await deleteDownloadJob(job.libraryEntryId, job.chapterNumber);
}

async function processQueue(): Promise<Map<string, Error>> {
  if (processing) return processing;
  processing = (async () => {
    const failures = new Map<string, Error>();
    for (const job of await listDownloadJobs()) {
      try {
        await processJob(job);
      } catch (reason) {
        failures.set(
          key(job.libraryEntryId, job.chapterNumber),
          reason instanceof Error ? reason : new Error(String(reason)),
        );
      }
    }
    if (!(await listDownloadJobs()).length) {
      try {
        if (await TaskManager.isTaskRegisteredAsync(taskName)) {
          await BackgroundTask.unregisterTaskAsync(taskName);
        }
      } catch {
        // No download data is lost if task unregistration fails.
      }
    }
    return failures;
  })().finally(() => {
    processing = null;
  });
  return processing;
}

TaskManager.defineTask(taskName, async () => {
  try {
    const failures = await processQueue();
    return failures.size
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function resumeQueuedDownloads(): Promise<void> {
  if (!(await listDownloadJobs()).length) return;
  await ensureBackgroundTask();
  await processQueue();
}

export async function downloadChapter(
  entryId: string,
  chapterNumber: number,
  sourceId: string,
  chapterId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const jobKey = key(entryId, chapterNumber);
  const existing = (await listDownloadJobs(entryId)).find(
    (job) => job.chapterNumber === chapterNumber,
  );
  if (!existing) {
    const pages = await resolveChapterPages(entryId, chapterNumber, sourceId, chapterId);
    if (
      !pages.length ||
      pages.length > 500 ||
      !pages.every((page) => page.uri.startsWith('https://'))
    ) {
      throw new Error('Ce chapitre est local ou contient trop de pages.');
    }
    await putDownloadJob({
      libraryEntryId: entryId,
      chapterNumber,
      sourceId,
      pages,
      nextPage: 0,
      createdAt: new Date().toISOString(),
    });
  }
  if (onProgress) listeners.set(jobKey, onProgress);
  try {
    await ensureBackgroundTask();
    let failures = await processQueue();
    if (!(await getDownloadedChapter(entryId, chapterNumber)) && !failures.has(jobKey)) {
      failures = await processQueue();
    }
    if (!(await getDownloadedChapter(entryId, chapterNumber))) {
      throw failures.get(jobKey) ?? new Error('Téléchargement en attente de reprise.');
    }
  } finally {
    listeners.delete(jobKey);
  }
}
