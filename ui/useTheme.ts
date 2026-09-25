import { useColorScheme } from 'react-native';

import { themes } from './theme';

export function useTheme() {
  return themes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
