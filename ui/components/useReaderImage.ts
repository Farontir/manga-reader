import { useEffect, useState } from 'react';

import { cachedImageUri } from '../../services/imageCache';
import type { ReaderPage } from '../../services/readerPages';

/**
 * Image source for a reader page: the disk-cached copy when available, falling back to the
 * original URL (with its headers) if the cached file cannot be read.
 */
export function useReaderImage(page: ReaderPage, onError?: () => void) {
  const [displayUri, setDisplayUri] = useState(page.uri);
  useEffect(() => {
    let active = true;
    void cachedImageUri(page)
      .then((uri) => {
        if (active && uri) setDisplayUri(uri);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [page]);
  return {
    source: { uri: displayUri, headers: displayUri === page.uri ? page.headers : undefined },
    handleError: () => {
      if (displayUri !== page.uri) setDisplayUri(page.uri);
      else onError?.();
    },
  };
}
