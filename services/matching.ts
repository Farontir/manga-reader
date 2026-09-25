export function normalizeTitle(title: string): string {
  return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function titlesMatch(
  canonical: string, alternatives: string[], candidate: string, candidateAlternatives: string[] = [],
): boolean {
  const originals = [canonical, ...alternatives].map(normalizeTitle).filter(Boolean);
  const candidates = [candidate, ...candidateAlternatives].map(normalizeTitle).filter(Boolean);
  return candidates.some((title) => originals.includes(title));
}
