import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { extractCbzPages } from './cbzStream';

async function* pieces(data: Uint8Array, width: number): AsyncIterable<Uint8Array> {
  for (let offset = 0; offset < data.length; offset += width) {
    yield data.subarray(offset, offset + width);
  }
}

describe('CBZ streaming', () => {
  it('extracts only images in reading order from small chunks', async () => {
    const archive = zipSync({
      'page10.jpg': new Uint8Array([10]),
      'page2.jpg': new Uint8Array([2]),
      '__MACOSX/cover.jpg': new Uint8Array([99]),
      'notes.txt': new Uint8Array([1]),
    });
    const result = await extractCbzPages(pieces(archive, 7), (_index, name) => {
      const bytes: number[] = [];
      return {
        value: { name, bytes },
        write: (chunk) => bytes.push(...chunk),
        close: () => undefined,
      };
    });
    expect(result.map((page) => [page.name, page.value.bytes])).toEqual([
      ['page2.jpg', [2]],
      ['page10.jpg', [10]],
    ]);
  });

  it('rejects empty image entries', async () => {
    const archive = zipSync({ 'empty.png': new Uint8Array() });
    await expect(
      extractCbzPages(pieces(archive, 11), () => ({
        value: null,
        write: () => undefined,
        close: () => undefined,
      })),
    ).rejects.toThrow('image vide');
  });

  it('handles a chapter of more than 200 pages without collecting image buffers', async () => {
    const archive = zipSync(
      Object.fromEntries(
        Array.from({ length: 220 }, (_, index) => [
          `page${index + 1}.jpg`,
          new Uint8Array([index % 256]),
        ]),
      ),
    );
    let written = 0;
    const result = await extractCbzPages(pieces(archive, 257), () => ({
      value: null,
      write: (chunk) => {
        written += chunk.length;
      },
      close: () => undefined,
    }));
    expect(result).toHaveLength(220);
    expect(result[0]?.name).toBe('page1.jpg');
    expect(result[219]?.name).toBe('page220.jpg');
    expect(written).toBe(220);
  });
});
