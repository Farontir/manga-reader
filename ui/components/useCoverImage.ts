import { useEffect, useState } from 'react';

import { coverImageSource } from '../../services/coverImage';
import { prefetchImage } from '../../services/imageCache';

/** Cache covers from CDNs that require a Referer before showing them in the native image view. */
export function useCoverImage(uri: string | null | undefined) {
  const remote = uri ? coverImageSource(uri) : undefined;
  const [local, setLocal] = useState<{ remote: string; uri: string } | null>(null);
  const remoteUri = remote?.uri;
  const referer = remote?.headers?.Referer;

  useEffect(() => {
    if (
      !remoteUri ||
      (referer !== 'https://m.fanfox.net/' && referer !== 'https://www.webtoons.com/')
    )
      return;
    let active = true;
    void prefetchImage({ uri: remoteUri, headers: { Referer: referer } })
      .then((cachedUri) => {
        if (active) setLocal({ remote: remoteUri, uri: cachedUri });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [remoteUri, referer]);

  return local && local.remote === remoteUri ? { uri: local.uri } : remote;
}
