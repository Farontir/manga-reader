export type CbzMetadata = {
  series?: string;
  chapter?: number;
  volume?: number;
  chapterTitle?: string;
};

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x[\da-f]+|\d+);/gi, (entity, code: string) => {
      const point = code[0]?.toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity;
    })
    .replace(/&(amp|lt|gt|quot|apos);/gi, (_, name: string) => {
      const entities: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
      };
      return entities[name.toLowerCase()] ?? '';
    })
    .trim();
}

function field(xml: string, name: string): string | undefined {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i').exec(xml);
  return match ? decodeXml(match[1] ?? '') || undefined : undefined;
}

function number(value?: string): number | undefined {
  if (!value || !/^\d+(?:[.,]\d+)?$/.test(value.trim())) return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseComicInfo(xml: string): CbzMetadata {
  if (!/<ComicInfo(?:\s|>)/i.test(xml)) return {};
  return {
    series: field(xml, 'Series'),
    chapter: number(field(xml, 'Number')),
    volume: number(field(xml, 'Volume')),
    chapterTitle: field(xml, 'Title'),
  };
}

const MARKER_START = String.raw`(?:^|[\s._\-(\[])`;
const MARKER_VALUE = String.raw`\.?\s*#?\s*(\d+(?:[.,]\d+)?)(?=$|[\s._\-)\]])`;
const CHAPTER_MARKER = new RegExp(
  `${MARKER_START}(?:chapitre|chapter|chap|ch|c)${MARKER_VALUE}`,
  'i',
);
// "t" covers the French "T01" / "T.05" volume notation.
const VOLUME_MARKER = new RegExp(`${MARKER_START}(?:tome|volume|vol|t|v)${MARKER_VALUE}`, 'i');

function cleanSeries(value: string): string | undefined {
  return (
    value
      .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s._-]+|[\s._\-(\[]+$/g, '')
      .trim() || undefined
  );
}

export function parseArchiveName(filename: string): CbzMetadata {
  const stem = filename
    .replace(/\.(?:cbz|zip)$/i, '')
    .replace(/_+/g, ' ')
    .replace(/^(?:\s*(?:\[[^\]]*\]|\([^)]*\)))+/, '')
    .trim();
  const chapterMatch = CHAPTER_MARKER.exec(stem);
  const volumeMatch = VOLUME_MARKER.exec(stem);
  if (!chapterMatch && !volumeMatch) {
    // "One Piece 1087" / "Blame! - 01": a bare trailing number is the chapter.
    const bare = /^(.*?\S)[\s-]+#?(\d+(?:[.,]\d+)?)$/.exec(cleanSeries(stem) ?? '');
    if (bare) return { series: cleanSeries(bare[1] ?? ''), chapter: number(bare[2]) };
    return { series: cleanSeries(stem) };
  }
  const firstMarker = Math.min(
    chapterMatch?.index ?? stem.length,
    volumeMatch?.index ?? stem.length,
  );
  return {
    series: cleanSeries(stem.slice(0, firstMarker)),
    chapter: number(chapterMatch?.[1]),
    volume: number(volumeMatch?.[1]),
  };
}

// ComicInfo.xml wins; the filename fills only missing fields, then the containing
// folder names the series for archives like "Chapter 12.cbz". A volume-only CBZ
// uses its volume as the local reading key, while the displayed label stays "Tome".
export function resolveCbzMetadata(
  filename: string,
  comicInfo?: CbzMetadata,
  folderName?: string,
): {
  series: string;
  chapterNumber: number;
  chapterTitle: string;
} {
  const fallback = parseArchiveName(filename);
  const series =
    comicInfo?.series ||
    fallback.series ||
    (folderName ? cleanSeries(folderName) : undefined) ||
    filename.replace(/\.(?:cbz|zip)$/i, '');
  const chapter = comicInfo?.chapter ?? fallback.chapter;
  const volume = comicInfo?.volume ?? fallback.volume;
  const chapterNumber = chapter ?? volume ?? 1;
  const parts = [
    volume !== undefined ? `Tome ${volume}` : undefined,
    chapter !== undefined ? `Chapitre ${chapter}` : undefined,
    comicInfo?.chapterTitle,
  ].filter((part): part is string => Boolean(part));
  return {
    series,
    chapterNumber,
    chapterTitle: parts.join(' · ') || `Chapitre ${chapterNumber}`,
  };
}
