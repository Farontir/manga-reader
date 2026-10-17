import { Image, type ImageProps } from 'expo-image';

import { appFileUri } from '../../services/appFiles';
import { useCoverImage } from './useCoverImage';

/** Library covers use the same protected-CDN cache as Discover covers. */
export function LibraryCoverImage({ uri, ...props }: Omit<ImageProps, 'source'> & { uri: string }) {
  const source = useCoverImage(uri.startsWith('file:') ? appFileUri(uri) : uri);
  return <Image {...props} source={source} />;
}
