import { getDatabase } from '../connection';

export type ImportedArchiveStatus = 'imported' | 'skipped' | 'failed';

/** Keys already handled; failed archives are left out when `includeFailed` is false. */
export async function listImportedArchiveKeys(includeFailed: boolean): Promise<Set<string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ archive_key: string }>(
    includeFailed
      ? 'SELECT archive_key FROM imported_archives'
      : "SELECT archive_key FROM imported_archives WHERE status != 'failed'",
  );
  return new Set(rows.map((row) => row.archive_key));
}

export async function recordImportedArchive(
  key: string,
  status: ImportedArchiveStatus,
  error?: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO imported_archives(archive_key, status, error, recorded_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(archive_key) DO UPDATE SET
       status = excluded.status, error = excluded.error, recorded_at = excluded.recorded_at`,
    key,
    status,
    error ?? null,
    new Date().toISOString(),
  );
}
