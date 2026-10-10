import { describe, expect, it } from 'vitest';

import { parseCatalogPage, parseDiscover, parseManga, parseSection } from './parse';

describe('source result parsing', () => {
  it('keeps valid manga and drops incomplete ones', () => {
    expect(
      parseManga({ id: ' a ', title: 'One', coverUrl: 'https://x/c.jpg', anilistId: 3 }),
    ).toEqual({
      id: 'a',
      title: 'One',
      altTitles: undefined,
      coverUrl: 'https://x/c.jpg',
      description: undefined,
      anilistId: 3,
    });
    expect(parseManga({ id: 'a' })).toBeNull();
    expect(parseManga('nope')).toBeNull();
  });

  it('parses discover sections, dropping empty or malformed ones', () => {
    const { sections } = parseDiscover({
      sections: [
        { title: 'Tendances', items: [{ id: '1', title: 'A' }, { title: 'no id' }] },
        { title: 'Vide', items: [] },
        'garbage',
        { items: [{ id: '2', title: 'B' }] },
      ],
    });
    expect(
      sections.map((section) => [section.title, section.items.map((item) => item.id)]),
    ).toEqual([
      ['Tendances', ['1']],
      ['Recommandations', ['2']],
    ]);
  });

  it('caps sections and items', () => {
    const items = Array.from({ length: 50 }, (_, index) => ({ id: String(index), title: 'T' }));
    const { sections } = parseDiscover({
      sections: Array.from({ length: 10 }, (_, index) => ({ title: `S${index}`, items })),
    });
    expect(sections).toHaveLength(6);
    expect(sections[0]?.items).toHaveLength(30);
  });

  it('rejects a discover result without sections', () => {
    expect(() => parseDiscover({ title: 'x', items: [] })).toThrow('Discover invalide.');
    expect(parseSection({ title: 'x' })).toBeNull();
  });

  it('parses a catalogue page with its sorts', () => {
    expect(
      parseCatalogPage({
        items: [{ id: '1', title: 'A' }, { title: 'no id' }],
        hasMore: true,
        sorts: [
          { id: 'popular', title: 'Populaires' },
          { id: 'popular', title: 'Doublon' },
          { id: 'az' },
          { id: 'az', title: 'A–Z' },
        ],
      }),
    ).toEqual({
      items: [expect.objectContaining({ id: '1', title: 'A' })],
      hasMore: true,
      sorts: [
        { id: 'popular', title: 'Populaires' },
        { id: 'az', title: 'A–Z' },
      ],
    });
  });

  it('treats a missing hasMore as the last page and rejects malformed pages', () => {
    expect(parseCatalogPage({ items: [] })).toEqual({ items: [], hasMore: false, sorts: [] });
    expect(() => parseCatalogPage({ sections: [] })).toThrow('Catalogue invalide.');
  });

  it('keeps the full-listing id of sections and the genres of a discover page', () => {
    expect(
      parseDiscover({
        sections: [
          { title: 'Populaires', items: [{ id: '1', title: 'A' }], more: 'popular' },
          { title: 'Sans suite', items: [{ id: '2', title: 'B' }], more: '' },
        ],
        genres: [
          { id: 'tag:action', title: 'Action' },
          { id: 'tag:action', title: 'Doublon' },
          { title: 'Sans id' },
        ],
      }),
    ).toEqual({
      sections: [
        { title: 'Populaires', items: [expect.objectContaining({ id: '1' })], more: 'popular' },
        { title: 'Sans suite', items: [expect.objectContaining({ id: '2' })] },
      ],
      genres: [{ id: 'tag:action', title: 'Action' }],
    });
  });
});
