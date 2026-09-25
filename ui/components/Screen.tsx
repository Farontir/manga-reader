import type { PropsWithChildren } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';

import { useTheme } from '../useTheme';

export function Screen({ children }: PropsWithChildren) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
