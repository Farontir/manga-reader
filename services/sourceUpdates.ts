type Versioned = { version: string; contentRating: string };

/**
 * What to do with a source when its repository offers `available`: nothing when the
 * version is the same, update it silently, or wait for the user when it becomes adult.
 */
export function updateDecision(
  installed: Versioned,
  available: Versioned,
): 'none' | 'update' | 'confirm' {
  if (available.version === installed.version) return 'none';
  if (available.contentRating === 'adult' && installed.contentRating !== 'adult') return 'confirm';
  return 'update';
}
