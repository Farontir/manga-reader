import { useEffect, useRef, useState } from 'react';

import { cachedImageUri } from '../../services/imageCache';
import type { ReaderPage } from '../../services/readerPages';

/**
 * Image source for a reader page: the disk-cached copy when available, falling back to the
 * original URL (with its headers) if the cached file cannot be read.
 */
export function useReaderImage(page: ReaderPage, onError?: () => void) {
  const [displayUri, setDisplayUri] = useState(page.uri);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const retries = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let active = true;
    retries.current = 0;
    void cachedImageUri(page)
      .then((uri) => {
        if (active && uri) setDisplayUri(uri);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [page]);
  return {
    source: { uri: displayUri, headers: displayUri === page.uri ? page.headers : undefined },
    attempt,
    failed,
    retry: () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      retries.current = 0;
      setDisplayUri(page.uri);
      setFailed(false);
      setAttempt((value) => value + 1);
    },
    handleError: () => {
      if (displayUri !== page.uri) {
        setDisplayUri(page.uri);
      } else if (retries.current < 2 && !retryTimer.current) {
        const delay = 800 * 2 ** retries.current;
        retries.current += 1;
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          setAttempt((value) => value + 1);
        }, delay);
      } else if (retries.current >= 2 && !retryTimer.current) {
        setFailed(true);
        onError?.();
      }
    },
  };
}
