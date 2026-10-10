import { Paths } from 'expo-file-system';

import { rebaseDocumentUri } from './appPaths';
import { coverImageSource } from './coverImage';

/** A saved file URI, valid even if iOS moved the app's data container since it was saved. */
export function appFileUri(uri: string): string {
  return rebaseDocumentUri(uri, Paths.document.uri);
}

/** Image source for a library cover: local covers (first imported page) follow the container. */
export function libraryCoverSource(uri: string) {
  return coverImageSource(uri.startsWith('file:') ? appFileUri(uri) : uri);
}
