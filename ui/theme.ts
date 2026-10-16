export type Theme = {
  background: string;
  surface: string;
  foreground: string;
  secondary: string;
  border: string;
  accent: string;
  accentText: string;
  danger: string;
  success: string;
  warning: string;
  /** Unread badge background; white text on it in both themes. */
  badge: string;
  /** Dark background: light status bar. */
  dark: boolean;
};

type Base = Omit<Theme, 'accent' | 'accentText'>;

const bases: Record<'light' | 'dark' | 'black', Base> = {
  light: {
    background: '#F7F5F0',
    surface: '#FFFFFF',
    foreground: '#121820',
    secondary: '#707985',
    border: '#E6E5E0',
    danger: '#CF3C3C',
    success: '#23855D',
    warning: '#A96E00',
    badge: '#D7322A',
    dark: false,
  },
  dark: {
    background: '#111519',
    surface: '#1D2328',
    foreground: '#F4F2EC',
    secondary: '#ADB4B8',
    border: '#353D41',
    danger: '#FF7070',
    success: '#70CFA0',
    warning: '#F4B64E',
    badge: '#D7322A',
    dark: true,
  },
  // Pure black for OLED screens.
  black: {
    background: '#000000',
    surface: '#121212',
    foreground: '#F4F2EC',
    secondary: '#A3A9AD',
    border: '#2A2A2A',
    danger: '#FF7070',
    success: '#70CFA0',
    warning: '#F4B64E',
    badge: '#D7322A',
    dark: true,
  },
};

export type ThemeMode = 'system' | 'light' | 'dark' | 'black';
export type AccentId = 'coral' | 'ocean' | 'mint' | 'lavender' | 'sakura' | 'amber' | 'ink';

type Accent = { id: AccentId; name: string; light: string; dark: string };

const coral: Accent = { id: 'coral', name: 'Corail', light: '#EE6B4D', dark: '#FF8667' };

/** Accent colors: one shade for light backgrounds, a brighter one for dark ones. */
export const accents: Accent[] = [
  coral,
  { id: 'ocean', name: 'Océan', light: '#2A74C9', dark: '#6AAAF2' },
  { id: 'mint', name: 'Menthe', light: '#17876A', dark: '#5DD3AE' },
  { id: 'lavender', name: 'Lavande', light: '#7356D1', dark: '#A996F5' },
  { id: 'sakura', name: 'Sakura', light: '#D23F78', dark: '#F58AB3' },
  { id: 'amber', name: 'Ambre', light: '#B26F00', dark: '#F2B94B' },
  { id: 'ink', name: 'Encre', light: '#2B3038', dark: '#E6E3DC' },
];

export const modes: { id: ThemeMode; name: string }[] = [
  { id: 'system', name: 'Système' },
  { id: 'light', name: 'Clair' },
  { id: 'dark', name: 'Sombre' },
  { id: 'black', name: 'Noir' },
];

/** The theme for a mode, the iPhone's own scheme (used by "system") and an accent. */
export function buildTheme(
  mode: ThemeMode,
  systemScheme: 'light' | 'dark',
  accentId: AccentId,
): Theme {
  const baseId = mode === 'system' ? systemScheme : mode;
  const base = bases[baseId];
  const accent = accents.find((item) => item.id === accentId) ?? coral;
  return {
    ...base,
    accent: base.dark ? accent.dark : accent.light,
    // Text on accent-coloured buttons: white on light themes, the background on dark ones.
    accentText: base.dark ? base.background : '#FFFFFF',
  };
}
