import type { SourceManga, SourceSection } from './types';

// Source bundles are untrusted: everything they return is validated here.

export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalStrings(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined;
}

export function parseManga(value: unknown): SourceManga | null {
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

const MAX_SECTIONS = 6;
const MAX_ITEMS = 30;

/** One titled row of manga; null when the value is not a section. */
export function parseSection(
  value: unknown,
  fallbackTitle = 'Recommandations',
): SourceSection | null {
  const data = record(value);
  if (!data || !Array.isArray(data.items)) return null;
  return {
    title: string(data.title)?.slice(0, 40) ?? fallbackTitle,
    items: data.items
      .map(parseManga)
      .filter((item): item is SourceManga => item !== null)
      .slice(0, MAX_ITEMS),
  };
}

/** `discover()` result: `{ sections: [...] }`, empty sections dropped. */
export function parseDiscover(value: unknown): SourceSection[] {
  const sections = record(value)?.sections;
  if (!Array.isArray(sections)) throw new Error('Discover invalide.');
  return sections
    .map((section) => parseSection(section))
    .filter((section): section is SourceSection => !!section && section.items.length > 0)
    .slice(0, MAX_SECTIONS);
}
