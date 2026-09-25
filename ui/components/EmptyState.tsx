import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../useTheme';

type Props = { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string };

export function EmptyState({ icon, title, detail }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.icon, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name={icon} size={32} color={theme.accent} />
      </View>
      <Text style={[styles.title, { color: theme.foreground }]}>{title}</Text>
      <Text style={[styles.detail, { color: theme.secondary }]}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    marginBottom: 18,
    width: 72,
  },
  title: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
  detail: { fontSize: 14, lineHeight: 21, marginTop: 7, textAlign: 'center' },
});
