import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { getSetting, setSetting } from '../db';
import { isSensitive, type SensitiveFields } from '../services/sensitive';
import { successFeedback } from './haptics';

const HIDE_KEY = 'privacy.hideSensitive';

type PrivacyState = {
  /** The "Masquer le contenu sensible" setting, on by default. */
  hideSensitive: boolean;
  /** Shown for this session only: never persisted, false at launch, reset in background. */
  unlocked: boolean;
};

export const usePrivacy = create<PrivacyState>(() => ({ hideSensitive: true, unlocked: false }));

/** Whether sensitive manga may be shown right now. */
export function useShowSensitive(): boolean {
  return usePrivacy((state) => !state.hideSensitive || state.unlocked);
}

export async function loadPrivacySettings(): Promise<void> {
  usePrivacy.setState({ hideSensitive: (await getSetting(HIDE_KEY)) !== '0' });
}

/**
 * Face ID, or the iPhone passcode as fallback. A phone without any passcode has nothing
 * to check against: the owner is let through. Failure or cancel: false, nothing shown.
 */
async function authenticateOwner(): Promise<boolean> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) return true;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirme ton identité',
      cancelLabel: 'Annuler',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

/** The discreet gesture: unlock after Face ID, or lock again at once. */
export async function toggleSensitiveLock(): Promise<void> {
  const { hideSensitive, unlocked } = usePrivacy.getState();
  if (unlocked) {
    usePrivacy.setState({ unlocked: false });
    return;
  }
  if (!hideSensitive) return;
  if (await authenticateOwner()) {
    usePrivacy.setState({ unlocked: true });
    successFeedback();
  }
}

/** Turning hiding off asks for Face ID; turning it back on does not. */
export async function setHideSensitive(hide: boolean): Promise<void> {
  if (!hide && !(await authenticateOwner())) return;
  await setSetting(HIDE_KEY, hide ? '1' : '0');
  usePrivacy.setState({ hideSensitive: hide, unlocked: false });
}

/**
 * Locks when the app goes to the background, and reports whether to cover the screen:
 * while inactive (app switcher, Face ID prompt…) so its preview shows nothing.
 */
export function usePrivacyCover(): boolean {
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background') usePrivacy.setState({ unlocked: false });
      setCovered(state === 'inactive' || state === 'background');
    });
    return () => subscription.remove();
  }, []);
  return covered;
}

/**
 * For screens showing one manga: true while it must stay hidden, in which case the user
 * is sent back to the library (e.g. after the app was locked in the background).
 */
export function useSensitiveGuard(entry: SensitiveFields | null): boolean {
  const router = useRouter();
  const showSensitive = useShowSensitive();
  const hidden = !!entry && !showSensitive && isSensitive(entry);
  useEffect(() => {
    if (!hidden) return;
    if (router.canDismiss()) router.dismissAll();
    router.navigate('/(tabs)/library');
  }, [hidden, router]);
  return hidden;
}
