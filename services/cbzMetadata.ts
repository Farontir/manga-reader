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

export function parseArchiveName(filename: string): CbzMetadata {
  const stem = filename
    .replace(/\.(?:cbz|zip)$/i, '')
    .replace(/[_]+/g, ' ')
    .trim();
  const chapterMatch =
    /(?:^|[\s._-])(?:chapitre|chapter|ch|c)\.?\s*#?\s*(\d+(?:[.,]\d+)?)(?=$|[\s._-])/i.exec(stem);
  const volumeMatch =
    /(?:^|[\s._-])(?:tome|volume|vol|v)\.?\s*#?\s*(\d+(?:[.,]\d+)?)(?=$|[\s._-])/i.exec(stem);
  const firstMarker = Math.min(
    chapterMatch?.index ?? stem.length,
    volumeMatch?.index ?? stem.length,
  );
  const series =
    stem
      .slice(0, firstMarker)
      .replace(/[\s._-]+$/, '')
      .trim() || stem;
  return {
    series,
    chapter: number(chapterMatch?.[1]),
    volume: number(volumeMatch?.[1]),
  };
}

// ComicInfo.xml wins; the filename fills only missing fields. A volume-only CBZ
// uses its volume as the local reading key, while the displayed label stays "Tome".
export function resolveCbzMetadata(
  filename: string,
  comicInfo?: CbzMetadata,
): {
  series: string;
  chapterNumber: number;
  chapterTitle: string;
} {
  const fallback = parseArchiveName(filename);
  const series = comicInfo?.series || fallback.series || filename;
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
