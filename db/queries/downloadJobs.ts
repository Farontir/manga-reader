import { getDatabase } from '../connection';
import type { DownloadJob } from '../schema';

type DownloadJobRow = {
  library_entry_id: string;
  chapter_number: number;
  source_id: string;
  pages_json: string;
  next_page: number;
  created_at: string;
};

function fromRow(row: DownloadJobRow): DownloadJob {
  return {
    libraryEntryId: row.library_entry_id,
    chapterNumber: row.chapter_number,
    sourceId: row.source_id,
    pages: JSON.parse(row.pages_json) as DownloadJob['pages'],
    nextPage: row.next_page,
    createdAt: row.created_at,
  };
}

export async function putDownloadJob(job: DownloadJob): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO download_jobs(library_entry_id, chapter_number, source_id, pages_json,
       next_page, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(library_entry_id, chapter_number) DO NOTHING`,
    job.libraryEntryId,
    job.chapterNumber,
    job.sourceId,
    JSON.stringify(job.pages),
    job.nextPage,
    job.createdAt,
  );
}

export async function listDownloadJobs(entryId?: string): Promise<DownloadJob[]> {
  const db = await getDatabase();
  const rows = entryId
    ? await db.getAllAsync<DownloadJobRow>(
        'SELECT * FROM download_jobs WHERE library_entry_id = ? ORDER BY created_at',
        entryId,
      )
    : await db.getAllAsync<DownloadJobRow>('SELECT * FROM download_jobs ORDER BY created_at');
  return rows.map(fromRow);
}

export async function setDownloadJobPage(
  entryId: string,
  chapterNumber: number,
  nextPage: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE download_jobs SET next_page = ? WHERE library_entry_id = ? AND chapter_number = ?',
    nextPage,
    entryId,
    chapterNumber,
  );
}

export async function deleteDownloadJob(entryId: string, chapterNumber: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM download_jobs WHERE library_entry_id = ? AND chapter_number = ?',
    entryId,
    chapterNumber,
  );
}
