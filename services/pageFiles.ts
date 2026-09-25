const IMAGE_PATTERN = /\.(jpe?g|png|webp|gif|avif)$/i;

export function isImagePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return IMAGE_PATTERN.test(normalized) && !normalized.split('/').some((part) =>
    part.startsWith('.') || part === '__MACOSX',
  );
}

export function sortPagePaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => a.localeCompare(b, undefined, {
    numeric: true, sensitivity: 'base',
  }));
}
