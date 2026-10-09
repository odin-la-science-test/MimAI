/* Navigation : pile unique, sans en-têtes natives (le design fournit les vôtres).
   Mìmir flotte au-dessus de tous les écrans lorsqu'il est activé.
   La bulle système ouvre l'assistant via le deep link mimai://assistant. */
import React, { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './nav-types';
import { Splash, Welcome, Device, Download, Ready } from './screens/onboarding';
import { Home } from './screens/home';
import { Chat } from './screens/chat';
import { Chats, Library, DocView } from './screens/lists';
import { Models } from './screens/models';
import { Training, TrainNew, TrainExample, TrainRun, TrainResult } from './screens/training';
import { Memory } from './screens/memory';
import { Privacy } from './screens/settings';
import { Companion, FloatingMimir } from './screens/companion';
import { Arena, Moves } from './screens/arena';
import { Game } from './screens/game';
import { CrashLog } from './screens/crashlog';
import { trail } from './services/crashlog';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNav() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 600); /* laisse le splash s'afficher avant Mìmir */
    return () => clearTimeout(t);
  }, []);
  /* la bulle système (ou un raccourci) ouvre l'assistant directement */
  const pendingLink = useRef(false);
  const pendingVoice = useRef<'mic' | 'bubble' | undefined>(undefined);
  useEffect(() => {
    const open = (url: string | null) => {
      if (!url || !url.startsWith('mimai://assistant')) return;
      /* lien reçu avant que la navigation soit prête (démarrage à froid) : on le garde */
      /* voice=force : appui long sur la bulle (écoute immédiate) ; voice=1 : simple toucher, selon le réglage */
      const voice = /[?&]voice=force/.test(url) ? 'mic' as const : /[?&]voice=1/.test(url) ? 'bubble' as const : undefined;
      if (navigationRef.isReady()) navigationRef.navigate('Chat', { voice });
      else { pendingLink.current = true; pendingVoice.current = voice; }
    };
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    Linking.getInitialURL().then(open).catch(() => { /* pas de lien initial */ });
    return () => sub.remove();
  }, []);
  return (
    <NavigationContainer ref={navigationRef} onStateChange={() => { const r = navigationRef.getCurrentRoute(); if (r) trail('écran ' + r.name); }} onReady={() => {
      if (pendingLink.current) { pendingLink.current = false; navigationRef.navigate('Chat', { voice: pendingVoice.current }); pendingVoice.current = undefined; }
    }}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade_from_bottom', contentStyle: { backgroundColor: '#f5ead8' } }}>
        <Stack.Screen name="Splash" component={Splash} />
        <Stack.Screen name="Welcome" component={Welcome} />
        <Stack.Screen name="Device" component={Device} />
        <Stack.Screen name="Download" component={Download} />
        <Stack.Screen name="Ready" component={Ready} />
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="Chat" component={Chat} />
        <Stack.Screen name="Chats" component={Chats} />
        <Stack.Screen name="Library" component={Library} />
        <Stack.Screen name="DocView" component={DocView} />
        <Stack.Screen name="Models" component={Models} />
        <Stack.Screen name="Training" component={Training} />
        <Stack.Screen name="TrainNew" component={TrainNew} />
        <Stack.Screen name="TrainExample" component={TrainExample} />
        <Stack.Screen name="TrainRun" component={TrainRun} />
        <Stack.Screen name="TrainResult" component={TrainResult} />
        <Stack.Screen name="Memory" component={Memory} />
        <Stack.Screen name="Privacy" component={Privacy} />
        <Stack.Screen name="Companion" component={Companion} />
        <Stack.Screen name="Arena" component={Arena} />
        <Stack.Screen name="Game" component={Game} options={{ animation: 'fade' }} />
        <Stack.Screen name="Moves" component={Moves} />
        <Stack.Screen name="CrashLog" component={CrashLog} />
      </Stack.Navigator>
      {ready ? <FloatingMimir /> : null}
    </NavigationContainer>
  );
}
