import { Unzip, UnzipInflate } from 'fflate';

import { comparePagePaths, isImagePath } from './pageFiles';

export type PageSink<T> = {
  value: T;
  write: (chunk: Uint8Array) => void;
  close: () => void;
};

export async function extractCbzPages<T>(
  chunks: AsyncIterable<Uint8Array>,
  openSink: (index: number, name: string) => PageSink<T>,
): Promise<{ name: string; value: T }[]> {
  const pages: { name: string; value: T }[] = [];
  const open = new Set<PageSink<T>>();
  let totalBytes = 0;
  const unzip = new Unzip((file) => {
    if (!isImagePath(file.name)) return;
    if (pages.length >= 500) throw new Error('Ce CBZ contient plus de 500 images.');
    if (file.originalSize && file.originalSize > 30 * 1024 * 1024) {
      throw new Error('Une image du CBZ dépasse 30 Mo.');
    }
    const sink = openSink(pages.length, file.name);
    pages.push({ name: file.name, value: sink.value });
    open.add(sink);
    let pageBytes = 0;
    file.ondata = (error, data, final) => {
      if (error) throw error;
      pageBytes += data.length;
      totalBytes += data.length;
      if (pageBytes > 30 * 1024 * 1024 || totalBytes > 250 * 1024 * 1024) {
        throw new Error('CBZ trop volumineux à décompresser. Utilise un dossier d’images.');
      }
      if (data.length) sink.write(data);
      if (final) {
        if (!pageBytes) throw new Error('Le CBZ contient une image vide.');
        open.delete(sink);
        sink.close();
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    for await (const chunk of chunks) unzip.push(chunk);
    unzip.push(new Uint8Array(), true);
    if (open.size) throw new Error('CBZ incomplet.');
    return pages.sort((a, b) => comparePagePaths(a.name, b.name));
  } finally {
    for (const sink of open) sink.close();
  }
}
