import type { InstalledSource } from '../db';
import { callSource } from '../native-bridge/sourceClient';
import type { SourceChapter, SourceManga } from './types';

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalStrings(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

function manga(value: unknown): SourceManga | null {
  const data = record(value);
  if (!data) return null;
  const id = string(data.id), title = string(data.title);
  if (!id || !title) return null;
  return { id, title, altTitles: optionalStrings(data.altTitles),
    coverUrl: string(data.coverUrl), description: string(data.description),
    anilistId: typeof data.anilistId === 'number' ? data.anilistId : undefined };
}

export async function searchSource(source: InstalledSource, query: string): Promise<SourceManga[]> {
  const result = await callSource(source, 'search', [query]);
  if (!Array.isArray(result)) throw new Error('Résultat de recherche invalide.');
  return result.map(manga).filter((item): item is SourceManga => item !== null).slice(0, 50);
}

export async function getSourceManga(source: InstalledSource, id: string): Promise<SourceManga> {
  const result = manga(await callSource(source, 'manga', [id]));
  if (!result) throw new Error('Fiche manga invalide.');
  return result;
}

export async function getSourceChapters(
  source: InstalledSource, id: string,
): Promise<SourceChapter[]> {
  const result = await callSource(source, 'chapters', [id]);
  if (!Array.isArray(result)) throw new Error('Liste de chapitres invalide.');
  return result.flatMap((item) => {
    const data = record(item);
    if (!data) return [];
    const chapterId = string(data.id);
    const number = data.number;
    if (!chapterId || typeof number !== 'number' || !Number.isFinite(number)) return [];
    return [{ id: chapterId, number, title: string(data.title),
      language: string(data.language), publishedAt: string(data.publishedAt) }];
  });
}

export async function getSourcePages(source: InstalledSource, chapterId: string): Promise<string[]> {
  const result = await callSource(source, 'pages', [chapterId]);
  if (!Array.isArray(result)) throw new Error('Liste de pages invalide.');
  const pages = result.filter((value): value is string => typeof value === 'string' &&
    value.startsWith('https://'));
  if (!pages.length) throw new Error('Aucune page disponible.');
  return pages;
}

export async function checkSourceHealth(source: InstalledSource): Promise<boolean> {
  try {
    const result = await callSource(source, 'health');
    return result === true;
  } catch { return false; }
}
