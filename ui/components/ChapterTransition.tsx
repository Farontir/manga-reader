import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../useTheme';

export type TransitionState =
  /** Next chapter is loaded right below (webtoon): keep scrolling. */
  | 'ready'
  /** Next chapter is loading or opening. */
  | 'loading'
  /** Loading the next chapter failed: tap to retry. */
  | 'failed'
  /** No later chapter is known. */
  | 'last';

type Props = {
  finished: string;
  next: string | null;
  state: TransitionState;
  minHeight: number;
  width?: number;
  onPress?: () => void;
};

/** Divider between two chapters: "end of X / next: Y". */
export function ChapterTransition({ finished, next, state, minHeight, width, onPress }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.root, { minHeight, width, borderColor: theme.border }]}
    >
      <Text style={[styles.finished, { color: theme.secondary }]}>Fin · {finished}</Text>
      {state === 'last' || !next ? (
        <Text style={[styles.title, { color: theme.foreground }]}>Dernier chapitre disponible</Text>
      ) : (
        <View style={styles.next}>
          <Text style={[styles.title, { color: theme.foreground }]}>Chapitre suivant : {next}</Text>
          {state === 'loading' ? (
            <ActivityIndicator color={theme.accent} style={{ marginTop: 12 }} />
          ) : state === 'failed' ? (
            <Text style={[styles.hint, { color: theme.danger }]}>
              Chargement impossible · touche pour réessayer
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
    justifyContent: 'center',
    padding: 28,
  },
  finished: { fontSize: 13 },
  next: { alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  hint: { fontSize: 13, fontWeight: '700', marginTop: 8, textAlign: 'center' },
});
