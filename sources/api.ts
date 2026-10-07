import type { InstalledSource } from '../db';
import { callSource } from '../native-bridge/sourceClient';
import { parseDiscover, parseManga, parseSection, record, string } from './parse';
import type { SourceChapter, SourceManga, SourcePage, SourceSection } from './types';

export async function searchSource(source: InstalledSource, query: string): Promise<SourceManga[]> {
  const result = await callSource(source, 'search', [query]);
  if (!Array.isArray(result)) throw new Error('Résultat de recherche invalide.');
  return result
    .map(parseManga)
    .filter((item): item is SourceManga => item !== null)
    .slice(0, 50);
}

function isMissingMethod(reason: unknown): boolean {
  return reason instanceof Error && reason.message.includes('Méthode absente');
}

/**
 * Sections of a source's Discover page: `discover()`, else the single section of older
 * `recommendations()` bundles. `supported` is false when the bundle offers neither.
 */
export async function getSourceDiscover(
  source: InstalledSource,
): Promise<{ sections: SourceSection[]; supported: boolean }> {
  try {
    return { sections: parseDiscover(await callSource(source, 'discover')), supported: true };
  } catch (reason) {
    if (!isMissingMethod(reason)) throw reason;
  }
  try {
    const section = parseSection(await callSource(source, 'recommendations'));
    if (!section) throw new Error('Recommandations invalides.');
    return { sections: section.items.length ? [section] : [], supported: true };
  } catch (reason) {
    if (isMissingMethod(reason)) return { sections: [], supported: false };
    throw reason;
  }
}

export async function getSourceManga(source: InstalledSource, id: string): Promise<SourceManga> {
  const result = parseManga(await callSource(source, 'manga', [id]));
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
