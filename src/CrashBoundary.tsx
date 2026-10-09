/* Filet de sécurité : une erreur d'affichage (React) ne ferme plus l'application en silence.
   L'erreur est écrite dans le journal et un écran propose de copier le rapport ou de réessayer. */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { buildReport, recordJsError } from './services/crashlog';

interface State { error: Error | null; copied: boolean }

export class CrashBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> { return { error, copied: false }; }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    recordJsError('affichage React', Object.assign(error, { componentStack: info?.componentStack }), true);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const report = buildReport(null, ['Erreur d’affichage : ' + String(this.state.error.message).slice(0, 300)]);
    const btn = { minHeight: 52, borderRadius: 26, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 20 };
    return (
      <View style={{ flex: 1, backgroundColor: '#f5ead8', padding: 22, paddingTop: 56 }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: '#2a2622' }}>MiMai a rencontré un problème</Text>
        <Text style={{ marginTop: 8, fontSize: 14.5, lineHeight: 21, color: '#4a443d' }}>
          L’erreur est enregistrée. Copiez le rapport (aucune conversation n’y figure) et envoyez-le pour qu’elle soit corrigée.
        </Text>
        <ScrollView style={{ flex: 1, marginTop: 14, borderRadius: 18, backgroundColor: '#ebdcc2', padding: 12 }}>
          <Text selectable style={{ fontSize: 11.5, lineHeight: 16, color: '#2a2622' }}>{report}</Text>
        </ScrollView>
        <View style={{ gap: 10, marginTop: 14 }}>
          <TouchableOpacity accessibilityRole="button" style={{ ...btn, backgroundColor: '#c67139' }}
            onPress={() => { void Clipboard.setStringAsync(report).then(() => this.setState({ copied: true })); }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{this.state.copied ? 'Rapport copié ✓' : 'Copier le rapport'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={{ ...btn, backgroundColor: '#ebdcc2' }} onPress={() => { void Share.share({ message: report }); }}>
            <Text style={{ color: '#2a2622', fontSize: 16, fontWeight: '700' }}>Partager…</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={{ ...btn, backgroundColor: '#ebdcc2' }} onPress={() => this.setState({ error: null, copied: false })}>
            <Text style={{ color: '#2a2622', fontSize: 16, fontWeight: '700' }}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}
