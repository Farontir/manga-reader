const IMAGE_PATTERN = /\.(jpe?g|png|webp|gif|avif)$/i;

export function isImagePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return (
    IMAGE_PATTERN.test(normalized) &&
    !normalized.split('/').some((part) => part.startsWith('.') || part === '__MACOSX')
  );
}

export function sortPagePaths(paths: string[]): string[] {
  return [...paths].sort(comparePagePaths);
}

export function comparePagePaths(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
