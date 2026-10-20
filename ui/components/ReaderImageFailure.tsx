import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../useTheme';

export function ReaderImageFailure({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.message, { color: theme.secondary }]}>Image indisponible</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={[styles.button, { borderColor: theme.accent }]}
      >
        <Text style={[styles.buttonText, { color: theme.accent }]}>Réessayer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 144, alignItems: 'center', justifyContent: 'center', gap: 12 },
  message: { fontSize: 15 },
  button: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 9 },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
