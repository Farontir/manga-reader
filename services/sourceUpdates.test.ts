import { describe, expect, it } from 'vitest';

import { updateDecision } from './sourceUpdates';

describe('automatic source updates', () => {
  const safe = (version: string) => ({ version, contentRating: 'safe' });
  const adult = (version: string) => ({ version, contentRating: 'adult' });

  it('updates silently when only the version changes', () => {
    expect(updateDecision(safe('1.0.0'), safe('1.0.0'))).toBe('none');
    expect(updateDecision(safe('1.0.0'), safe('1.1.0'))).toBe('update');
    expect(updateDecision(adult('1.5.1'), adult('1.5.2'))).toBe('update');
    expect(updateDecision(adult('1.5.1'), safe('1.6.0'))).toBe('update');
  });

  it('waits for the user when a source becomes adult', () => {
    expect(updateDecision(safe('1.0.0'), adult('1.1.0'))).toBe('confirm');
  });
});
