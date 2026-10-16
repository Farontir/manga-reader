import { describe, expect, it } from 'vitest';

import { tolerantSearch } from './tolerantSearch';

describe('tolerant search', () => {
  // A site that only finds titles containing the exact query.
  const catalogue = ['The Beginning After the End', 'Beginning of Spring', 'Solo Leveling'];
  const site = (queries: string[]) => async (query: string) => {
    queries.push(query);
    return catalogue
      .filter((title) => title.toLowerCase().includes(query.toLowerCase()))
      .map((title) => ({ id: title }));
  };

  it('tries the article when the plain query finds too little', async () => {
    const queries: string[] = [];
    const found = await tolerantSearch('beginning after the end', site(queries), (item) => item.id);
    expect(found.map((item) => item.id)).toEqual(['The Beginning After the End']);
    expect(queries).toEqual(['beginning after the end', 'the beginning after the end']);
  });

  it('stops once enough is found, and keeps results when a variant fails', async () => {
    const queries: string[] = [];
    const many = async (query: string) => {
      queries.push(query);
      return [{ id: 1 }, { id: 2 }, { id: 3 }];
    };
    expect(await tolerantSearch('solo', many, (item) => item.id)).toHaveLength(3);
    expect(queries).toEqual(['solo']);
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls > 1) throw new Error('HTTP 500');
      return [{ id: 'x' }];
    };
    expect(await tolerantSearch('x-men', flaky, (item) => item.id)).toEqual([{ id: 'x' }]);
  });

  it('fails when the original query fails', async () => {
    await expect(
      tolerantSearch(
        'solo',
        async () => {
          throw new Error('down');
        },
        (item: { id: string }) => item.id,
      ),
    ).rejects.toThrow('down');
  });
});
