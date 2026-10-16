import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useAppearance } from './appearance';
import { buildTheme } from './theme';

export function useTheme() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const mode = useAppearance((state) => state.mode);
  const accent = useAppearance((state) => state.accent);
  return useMemo(() => buildTheme(mode, scheme, accent), [mode, scheme, accent]);
}
