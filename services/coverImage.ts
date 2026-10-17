/** Public image hosts that require their site's Referer for cover requests. */
export function coverImageSource(uri: string): { uri: string; headers?: Record<string, string> } {
  try {
    const hostname = new URL(uri).hostname;
    if (/(?:^|\.)2xstorage\.com$/i.test(hostname) || /^storage\d*\.waitst\.com$/i.test(hostname)) {
      return { uri, headers: { Referer: 'https://www.mangabats.com/' } };
    }
    if (hostname === 'webtoon-phinf.pstatic.net') {
      return { uri, headers: { Referer: 'https://www.webtoons.com/' } };
    }
    if (hostname === 'fmcdn.mfcdn.net') {
      return { uri, headers: { Referer: 'https://m.fanfox.net/' } };
    }
    if (hostname === 'sushiscan.net' || hostname.endsWith('.sushiscan.net')) {
      return { uri, headers: { Referer: 'https://sushiscan.net/' } };
    }
  } catch {
    // Local file URIs and malformed old entries keep their ordinary image source.
  }
  return { uri };
}
