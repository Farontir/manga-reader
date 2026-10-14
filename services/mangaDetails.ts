/** Details shown on a manga page, from AniList or the manga's source. */
export type MangaDetails = {
  genres: string[];
  authors: string[];
  /** AniList status, e.g. RELEASING, FINISHED. */
  status: string | null;
  /** AniList format, e.g. MANGA, NOVEL, ONE_SHOT. */
  format: string | null;
  /** ISO country of origin: JP, KR, CN… */
  country: string | null;
  year: number | null;
  /** Average score out of 100. */
  score: number | null;
  chapters: number | null;
  fetchedAt: string;
};

const STATUS: Record<string, string> = {
  RELEASING: 'En cours',
  FINISHED: 'Terminé',
  NOT_YET_RELEASED: 'À paraître',
  CANCELLED: 'Annulé',
  HIATUS: 'En pause',
};

const COUNTRY_FORMAT: Record<string, string> = { KR: 'Manhwa', CN: 'Manhua', TW: 'Manhua' };
const FORMAT: Record<string, string> = { MANGA: 'Manga', NOVEL: 'Roman', ONE_SHOT: 'One shot' };

/** AniList descriptions carry HTML (<br>, <i>…) and entities: plain text, paragraphs kept. */
export function cleanDescription(text: string | null | undefined): string | null {
  if (!text) return null;
  const plain = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return plain || null;
}

/** "Manhwa · En cours · 2018 · ★ 8,4 · 200 chapitres", from whatever is known. */
export function detailsLine(details: MangaDetails | null, entryStatus?: string | null): string {
  const parts: string[] = [];
  const country = details?.country ?? '';
  const format = details?.format ?? '';
  const kind =
    format === 'MANGA' && COUNTRY_FORMAT[country] ? COUNTRY_FORMAT[country] : FORMAT[format];
  if (kind) parts.push(kind);
  const status = details?.status ?? entryStatus ?? '';
  if (STATUS[status]) parts.push(STATUS[status] as string);
  if (details?.year) parts.push(String(details.year));
  if (details?.score) parts.push(`★ ${(details.score / 10).toFixed(1).replace('.', ',')}`);
  if (details?.chapters) {
    parts.push(`${details.chapters} chapitre${details.chapters > 1 ? 's' : ''}`);
  }
  return parts.join(' · ');
}
