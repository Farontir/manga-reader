import { queryVariants } from './matching';

// Below this many results, other spellings of the query are tried as well.
const ENOUGH = 3;

/**
 * Runs a search, then its variants (with/without the leading article, no punctuation)
 * while it found fewer than three results, merging them without duplicates. Fails only
 * when the original query fails.
 */
export async function tolerantSearch<T>(
  term: string,
  run: (query: string) => Promise<T[]>,
  idOf: (item: T) => string | number,
): Promise<T[]> {
  const found = await run(term);
  for (const variant of queryVariants(term)) {
    if (found.length >= ENOUGH) break;
    try {
      for (const item of await run(variant)) {
        if (!found.some((known) => idOf(known) === idOf(item))) found.push(item);
      }
    } catch {
      /* A variant failing keeps what was found. */
    }
  }
  return found;
}
