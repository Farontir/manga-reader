// iOS can move the app's data container when the app is updated (each TestFlight build):
// absolute file:// URIs saved in SQLite then point to a folder that no longer exists.
// Everything the app stores lives in these folders of its document directory.
const APP_FOLDERS = ['sources', 'local', 'downloads'];

/**
 * Rewrites a saved file URI onto the current document directory, keeping its path from
 * the app folder (sources/, local/, downloads/) on. Other URIs are returned unchanged.
 */
export function rebaseDocumentUri(uri: string, documentUri: string): string {
  if (!uri.startsWith('file:') || uri.startsWith(documentUri)) return uri;
  const root = documentUri.endsWith('/') ? documentUri : `${documentUri}/`;
  const searchFrom = Math.max(uri.indexOf('/Documents/'), 0);
  let best = -1;
  for (const folder of APP_FOLDERS) {
    const index = uri.indexOf(`/${folder}/`, searchFrom);
    if (index !== -1 && (best === -1 || index < best)) best = index;
  }
  return best === -1 ? uri : `${root}${uri.slice(best + 1)}`;
}
