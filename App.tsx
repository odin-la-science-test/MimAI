/* MiMai — Votre IA. Votre appareil. Vos données. Aucun serveur nécessaire. */
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { AppProvider, useApp } from './src/state';
import { RootNav } from './src/nav';
import { BubbleSync } from './src/BubbleSync';
import { OverlayChat } from './src/OverlayChat';
import { View, ActivityIndicator } from 'react-native';
import { C } from './src/theme';
import { CrashBoundary } from './src/CrashBoundary';
import { installCrashHandlers } from './src/services/crashlog';

installCrashHandlers();

/* fond de l'appli : suit la palette (orange hors ligne, bleu en mode en ligne) */
function Shell({ children }: { children: React.ReactNode }) {
  useApp();
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>{children}</GestureHandlerRootView>;
}

export default function App() {
  const [fonts, fontError] = useFonts({
    Caprasimo: require('./assets/fonts/Caprasimo-Regular.ttf'),
    Figtree: require('./assets/fonts/Figtree-Regular.ttf'),
    'Figtree-SemiBold': require('./assets/fonts/Figtree-SemiBold.ttf'),
    'Figtree-Bold': require('./assets/fonts/Figtree-Bold.ttf'),
  });

  /* si une police échoue à charger, on démarre quand même (police système) */
  if (!fonts && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <CrashBoundary>
    <AppProvider>
      <Shell>
      <SafeAreaProvider>
          <StatusBar style="dark" />
          <RootNav />
          <BubbleSync />
          <OverlayChat />
      </SafeAreaProvider>
      </Shell>
    </AppProvider>
    </CrashBoundary>
  );
}
