import { getDatabase } from '../connection';
import type { InstalledSource } from '../schema';

type SourceRow = {
  id: string; name: string; version: string; language: string; content_rating: string;
  repo_url: string; bundle_uri: string; manifest_json: string; installed_at: string;
  last_health_check: string | null; health_status: 'ok' | 'degraded' | 'down' | null;
};

function sourceFromRow(row: SourceRow): InstalledSource {
  return {
    id: row.id, name: row.name, version: row.version, language: row.language,
    contentRating: row.content_rating, repoUrl: row.repo_url,
    bundleUri: row.bundle_uri, manifestJson: row.manifest_json, installedAt: row.installed_at,
    lastHealthCheck: row.last_health_check, healthStatus: row.health_status,
  };
}

export async function listInstalledSources(): Promise<InstalledSource[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SourceRow>('SELECT * FROM installed_sources ORDER BY name');
  return rows.map(sourceFromRow);
}

export async function getInstalledSource(id: string): Promise<InstalledSource | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SourceRow>('SELECT * FROM installed_sources WHERE id = ?', id);
  return row ? sourceFromRow(row) : null;
}

export async function putInstalledSource(source: InstalledSource): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO installed_sources(id, name, version, language, content_rating, repo_url,
      bundle_uri, manifest_json, installed_at, last_health_check, health_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, version = excluded.version,
       language = excluded.language, content_rating = excluded.content_rating,
       repo_url = excluded.repo_url, bundle_uri = excluded.bundle_uri,
       manifest_json = excluded.manifest_json, last_health_check = excluded.last_health_check,
       health_status = excluded.health_status`,
    source.id, source.name, source.version, source.language, source.contentRating,
    source.repoUrl, source.bundleUri, source.manifestJson, source.installedAt,
    source.lastHealthCheck, source.healthStatus,
  );
}

export async function removeInstalledSource(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM installed_sources WHERE id = ?', id);
  // Deliberately retain source_bindings, chapters, and read_progress.
}

export async function setSourceHealth(
  id: string, status: InstalledSource['healthStatus'],
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE installed_sources SET health_status = ?, last_health_check = ? WHERE id = ?',
    status, new Date().toISOString(), id,
  );
}
