/** The English title first, then every other known title once. */
export function englishFirst(
  current: { canonicalTitle: string; altTitles: string[] },
  anilistTitles: string[],
): { canonicalTitle: string; altTitles: string[] } | null {
  const preferred = anilistTitles[0];
  if (!preferred || preferred === current.canonicalTitle) return null;
  const altTitles = [
    ...anilistTitles.slice(1),
    current.canonicalTitle,
    ...current.altTitles,
  ].filter((title, index, all) => title !== preferred && all.indexOf(title) === index);
  return { canonicalTitle: preferred, altTitles };
}
