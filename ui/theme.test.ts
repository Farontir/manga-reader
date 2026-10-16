import { describe, expect, it } from 'vitest';

import { accents, buildTheme } from './theme';

describe('themes', () => {
  it('follows the iPhone in system mode, and forces the others', () => {
    expect(buildTheme('system', 'dark', 'coral').background).toBe('#111519');
    expect(buildTheme('system', 'light', 'coral').background).toBe('#F7F5F0');
    expect(buildTheme('light', 'dark', 'coral').background).toBe('#F7F5F0');
    expect(buildTheme('black', 'light', 'coral')).toMatchObject({
      background: '#000000',
      dark: true,
    });
  });

  it('applies the accent shade made for the background', () => {
    const ocean = accents.find((item) => item.id === 'ocean');
    expect(buildTheme('light', 'light', 'ocean')).toMatchObject({
      accent: ocean?.light,
      accentText: '#FFFFFF',
    });
    expect(buildTheme('dark', 'light', 'ocean')).toMatchObject({
      accent: ocean?.dark,
      accentText: '#111519',
    });
  });

  it('keeps the original coral theme by default', () => {
    expect(buildTheme('system', 'light', 'coral').accent).toBe('#EE6B4D');
    expect(buildTheme('system', 'dark', 'coral').accent).toBe('#FF8667');
  });
});
