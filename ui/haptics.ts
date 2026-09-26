import * as Haptics from 'expo-haptics';

export function selectionFeedback(): void {
  void Haptics.selectionAsync().catch(() => undefined);
}

export function successFeedback(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
