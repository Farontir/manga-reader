export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Leading articles ignored when comparing titles ("The Beginning After the End").
const LEADING_ARTICLE = /^(the|a|an|le|la|les|l) /;

/** A normalized title without its leading article. */
export function withoutArticle(normalized: string): string {
  return normalized.replace(LEADING_ARTICLE, '');
}

export function titlesMatch(
  canonical: string,
  alternatives: string[],
  candidate: string,
  candidateAlternatives: string[] = [],
): boolean {
  const comparable = (title: string) => withoutArticle(normalizeTitle(title));
  const originals = [canonical, ...alternatives].map(comparable).filter(Boolean);
  const candidates = [candidate, ...candidateAlternatives].map(comparable).filter(Boolean);
  return candidates.some((title) => originals.includes(title));
}

/**
 * Other spellings to try when a search finds little: with or without the leading article,
 * and without punctuation. At most two, the original query excluded.
 */
export function queryVariants(query: string): string[] {
  const term = query.trim().replace(/\s+/g, ' ');
  const plain = term
    .replace(/[’'`]/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const article = /^(the|a|an|le|la|les|l)\s+/i;
  const variants = [article.test(plain) ? plain.replace(article, '') : `the ${plain}`, plain];
  return variants.filter(
    (variant, index, all) =>
      variant.length >= 2 &&
      variant.toLowerCase() !== term.toLowerCase() &&
      all.findIndex((other) => other.toLowerCase() === variant.toLowerCase()) === index,
  );
}
