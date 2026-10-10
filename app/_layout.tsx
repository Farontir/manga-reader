import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { getDatabase, pruneBrowsedEntries } from '../db';
import { SourceHost } from '../native-bridge/SourceHost';
import { resumeQueuedDownloads } from '../services/downloads';
import { preferEnglishTitles } from '../services/titleFix';
import { useFolderSyncOnForeground } from '../ui/folderSync';
import { useLibraryRefreshOnForeground } from '../ui/libraryRefresh';
import { useTheme } from '../ui/useTheme';

export default function RootLayout() {
  const theme = useTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDatabase()
      .then(() => {
        setReady(true);
        void resumeQueuedDownloads().catch(() => undefined);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        void pruneBrowsedEntries(weekAgo).catch(() => undefined);
        void preferEnglishTitles().catch(() => undefined);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, []);
  useFolderSyncOnForeground(ready);
  useLibraryRefreshOnForeground(ready);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        {error ? (
          <>
            <Text style={{ color: theme.foreground, fontWeight: '700', fontSize: 18 }}>
              Initialisation impossible
            </Text>
            <Text style={{ color: theme.secondary, marginTop: 8, textAlign: 'center' }}>
              {error}
            </Text>
          </>
        ) : (
          <ActivityIndicator color={theme.accent} size="large" />
        )}
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={theme.background === '#111519' ? 'light' : 'dark'} />
      <SourceHost />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.foreground,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="entry/[id]" options={{ title: 'Manga' }} />
        <Stack.Screen name="reader/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="import" options={{ title: 'Fichiers locaux' }} />
        <Stack.Screen name="sources" options={{ title: 'Sources' }} />
        <Stack.Screen name="catalog/[sourceId]" options={{ title: 'Catalogue' }} />
        <Stack.Screen name="add-source" options={{ title: 'Installer une source' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
