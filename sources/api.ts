import type { InstalledSource } from '../db';
import { callSource } from '../native-bridge/sourceClient';
import type { SourceChapter, SourceManga, SourcePage, SourceRecommendations } from './types';

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalStrings(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined;
}

function manga(value: unknown): SourceManga | null {
  const data = record(value);
  if (!data) return null;
  const id = string(data.id),
    title = string(data.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    altTitles: optionalStrings(data.altTitles),
    coverUrl: string(data.coverUrl),
    description: string(data.description),
    anilistId: typeof data.anilistId === 'number' ? data.anilistId : undefined,
  };
}

export async function searchSource(source: InstalledSource, query: string): Promise<SourceManga[]> {
  const result = await callSource(source, 'search', [query]);
  if (!Array.isArray(result)) throw new Error('Résultat de recherche invalide.');
  return result
    .map(manga)
    .filter((item): item is SourceManga => item !== null)
    .slice(0, 50);
}

/** Returns null when the installed bundle predates `recommendations`. */
export async function getSourceRecommendations(
  source: InstalledSource,
): Promise<SourceRecommendations | null> {
  let result: unknown;
  try {
    result = await callSource(source, 'recommendations');
  } catch (reason) {
    if (reason instanceof Error && reason.message.includes('Méthode absente')) return null;
    throw reason;
  }
  const data = record(result);
  if (!data || !Array.isArray(data.items)) throw new Error('Recommandations invalides.');
  return {
    title: string(data.title)?.slice(0, 40) ?? 'Recommandations',
    items: data.items
      .map(manga)
      .filter((item): item is SourceManga => item !== null)
      .slice(0, 30),
  };
}

export async function getSourceManga(source: InstalledSource, id: string): Promise<SourceManga> {
  const result = manga(await callSource(source, 'manga', [id]));
  if (!result) throw new Error('Fiche manga invalide.');
  return result;
}

export async function getSourceChapters(
  source: InstalledSource,
  id: string,
): Promise<SourceChapter[]> {
  const result = await callSource(source, 'chapters', [id]);
  if (!Array.isArray(result)) throw new Error('Liste de chapitres invalide.');
  return result.flatMap((item) => {
    const data = record(item);
    if (!data) return [];
    const chapterId = string(data.id);
    const number = data.number;
    if (!chapterId || typeof number !== 'number' || !Number.isFinite(number)) return [];
    return [
      {
        id: chapterId,
        number,
        title: string(data.title),
        language: string(data.language),
        publishedAt: string(data.publishedAt),
      },
    ];
  });
}

export async function getSourcePages(
  source: InstalledSource,
  chapterId: string,
): Promise<SourcePage[]> {
  const result = await callSource(source, 'pages', [chapterId]);
  if (!Array.isArray(result)) throw new Error('Liste de pages invalide.');
  const pages = result.flatMap((item) => {
    if (typeof item === 'string' && item.startsWith('https://')) return [{ url: item }];
    const value = record(item);
    if (!value || typeof value.url !== 'string' || !value.url.startsWith('https://')) return [];
    const raw = record(value.headers);
    const headers: Record<string, string> = {};
    if (raw)
      for (const [key, header] of Object.entries(raw)) {
        if (
          typeof header === 'string' &&
          ['authorization', 'x-api-key', 'referer', 'accept'].includes(key.toLowerCase())
        ) {
          headers[key] = header;
        }
      }
    return [{ url: value.url, headers }];
  });
  if (!pages.length) throw new Error('Aucune page disponible.');
  return pages;
}

export async function checkSourceHealth(source: InstalledSource): Promise<boolean> {
  try {
    const result = await callSource(source, 'health');
    return result === true;
  } catch {
    return false;
  }
}

export async function inspectSourceHealth(
  source: InstalledSource,
): Promise<'ok' | 'degraded' | 'down'> {
  if (!(await checkSourceHealth(source))) return 'down';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const url = new URL('status.json', source.repoUrl);
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) return 'ok'; // A custom repository need not publish status.json.
    const status = record((await response.json()) as unknown);
    if (!status || status.sourceId !== source.id) return 'degraded';
    if (status.status !== 'ok') return 'degraded';
    const checkedAt = typeof status.checkedAt === 'string' ? Date.parse(status.checkedAt) : NaN;
    if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > 24 * 60 * 60 * 1000) {
      return 'degraded';
    }
    return 'ok';
  } catch {
    return 'ok';
  } finally {
    clearTimeout(timeout);
  }
}
