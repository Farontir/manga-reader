import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../useTheme';

type Props = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
};

// Colours live on a plain View with a static style: on device, a Pressable style
// callback wrapped by NativeWind rendered no background at all, leaving the
// label the same colour as the screen.
export function ActionButton({ label, icon, onPress, secondary = false, disabled = false }: Props) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  const foreground = secondary ? theme.foreground : theme.accentText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <View
        style={[
          styles.button,
          {
            backgroundColor: secondary ? theme.surface : theme.accent,
            borderColor: secondary ? theme.border : theme.accent,
            opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
          },
        ]}
      >
        {icon ? <Ionicons name={icon} size={18} color={foreground} /> : null}
        <Text style={[styles.label, { color: foreground }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  label: { fontSize: 15, fontWeight: '700' },
});
