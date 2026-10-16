import { Appearance } from 'react-native';
import { create } from 'zustand';

import { getSetting, setSetting } from '../db';
import { accents, modes, type AccentId, type ThemeMode } from './theme';

const MODE_KEY = 'appearance.mode';
const ACCENT_KEY = 'appearance.accent';

type AppearanceState = { mode: ThemeMode; accent: AccentId };

export const useAppearance = create<AppearanceState>(() => ({ mode: 'system', accent: 'coral' }));

// Native parts (action sheets, alerts, keyboard) follow the chosen light or dark mode too.
function applyNativeScheme(mode: ThemeMode): void {
  Appearance.setColorScheme(
    mode === 'system' ? 'unspecified' : mode === 'light' ? 'light' : 'dark',
  );
}

export async function loadAppearance(): Promise<void> {
  const [mode, accent] = await Promise.all([getSetting(MODE_KEY), getSetting(ACCENT_KEY)]);
  const next: AppearanceState = {
    mode: modes.find((item) => item.id === mode)?.id ?? 'system',
    accent: accents.find((item) => item.id === accent)?.id ?? 'coral',
  };
  useAppearance.setState(next);
  applyNativeScheme(next.mode);
}

export async function setThemeMode(mode: ThemeMode): Promise<void> {
  useAppearance.setState({ mode });
  applyNativeScheme(mode);
  await setSetting(MODE_KEY, mode);
}

export async function setAccent(accent: AccentId): Promise<void> {
  useAppearance.setState({ accent });
  await setSetting(ACCENT_KEY, accent);
}
