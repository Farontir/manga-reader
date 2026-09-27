/** MangaBats' public image CDN checks the referring site for cover requests. */
export function coverImageSource(uri: string): { uri: string; headers?: Record<string, string> } {
  try {
    const hostname = new URL(uri).hostname;
    if (/(?:^|\.)2xstorage\.com$/i.test(hostname) || hostname === 'storage.waitst.com') {
      return { uri, headers: { Referer: 'https://www.mangabats.com/' } };
    }
  } catch {
    // Local file URIs and malformed old entries keep their ordinary image source.
  }
  return { uri };
}
