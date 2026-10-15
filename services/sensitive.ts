/** Per-title content rating, MangaDex values. */
export type ContentRating = 'safe' | 'suggestive' | 'erotica' | 'pornographic';

export const CONTENT_RATINGS: readonly ContentRating[] = [
  'safe',
  'suggestive',
  'erotica',
  'pornographic',
];

const SENSITIVE_RATINGS: readonly string[] = ['erotica', 'pornographic'];

export type SensitiveFields = {
  contentRating: string | null;
  anilistAdult: boolean | null;
  sensitiveOverride: boolean | null;
};

/**
 * The single rule (mirrored in SQL by db/queries/sensitiveSql.ts): the user's choice when
 * set, else sensitive when a source rates the title erotica/pornographic or AniList marks
 * it adult.
 */
export function isSensitive(entry: SensitiveFields): boolean {
  if (entry.sensitiveOverride !== null) return entry.sensitiveOverride;
  return (
    (entry.contentRating !== null && SENSITIVE_RATINGS.includes(entry.contentRating)) ||
    entry.anilistAdult === true
  );
}

export function isContentRating(value: unknown): value is ContentRating {
  return typeof value === 'string' && (CONTENT_RATINGS as readonly string[]).includes(value);
}

/** The stricter of two ratings, so a title rated by several sources keeps the highest. */
export function strictestRating(
  a: string | null | undefined,
  b: string | null | undefined,
): ContentRating | null {
  const rank = (value: string | null | undefined) =>
    isContentRating(value) ? CONTENT_RATINGS.indexOf(value) : -1;
  const best = rank(a) >= rank(b) ? a : b;
  return isContentRating(best) ? best : null;
}

// Genre names that mark a title as sensitive when its source gives no rating.
const SENSITIVE_GENRES = new Set([
  'adult',
  'hentai',
  'smut',
  'erotica',
  'erotique',
  'pornographic',
  'pornographique',
]);

function normalizeGenre(genre: string): string {
  return genre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

export function isSensitiveGenre(genre: string): boolean {
  return SENSITIVE_GENRES.has(normalizeGenre(genre));
}

/**
 * Rating of a title found on a source: its own rating when given, else 'erotica' when one
 * of its genres is sensitive, else null (unknown).
 */
export function sourceMangaRating(manga: {
  contentRating?: string;
  genres?: string[];
}): ContentRating | null {
  if (isContentRating(manga.contentRating)) return manga.contentRating;
  return manga.genres?.some(isSensitiveGenre) ? 'erotica' : null;
}

/** A title found on a source that must stay hidden while sensitive content is. */
export function isSensitiveSourceManga(manga: {
  contentRating?: string;
  genres?: string[];
}): boolean {
  return isSensitive({
    contentRating: sourceMangaRating(manga),
    anilistAdult: null,
    sensitiveOverride: null,
  });
}
