import { describe, expect, it } from 'vitest';

import { withImportLock } from './importLock';

describe('import lock', () => {
  it('runs imports one after another, even after a failure', async () => {
    const events: string[] = [];
    const task = (name: string, fail = false) =>
      withImportLock(async () => {
        events.push(`start ${name}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`end ${name}`);
        if (fail) throw new Error(name);
        return name;
      });

    const results = await Promise.allSettled([task('a', true), task('b'), task('c')]);

    expect(events).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
  });
});
