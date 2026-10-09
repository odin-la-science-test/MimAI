/* Un moteur d'IA par fonction : Rapide, Réflexion, Outils, Vision. */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useApp, MODELS } from '../state';
import { C, F } from '../theme';
import { Kicker, Btn } from '../ui';
import { FN_MODES, FN_LABEL, FN_HINT, modelForMode, candidatesFor, assign, isVisionModel } from '../services/modes';
import { fmtGo } from '../theme';

export function ModePicker({ onInstall }: { onInstall?: (id: string) => void }) {
  const { data, patchData, toast } = useApp();
  const s = data.settings;
  const installed = s.installed.filter(id => !!MODELS[id]);
  const defs = MODELS as unknown as Record<string, { tags?: string[]; name: string } | undefined>;
  const visionCatalog = Object.values(MODELS).filter(m => isVisionModel(m));

  const choose = (mode: (typeof FN_MODES)[number], id: string | null) => {
    patchData(d => { d.settings.modeModels = assign(d.settings.modeModels, mode, id, d.settings.installed); });
    toast(FN_LABEL[mode] + ' : ' + (id ? MODELS[id].name : 'modèle actif'));
  };

  return (
    <View>
      <Kicker style={{ marginTop: 22 }}>Un moteur par fonction</Kicker>
      <View style={{ marginTop: 8, borderRadius: 22, backgroundColor: C.n100, padding: 14, gap: 14 }}>
        <Text style={{ fontSize: 13, lineHeight: 19, color: C.n800 }}>
          Associez un modèle à chaque fonction. Sans choix, le modèle actif répond. Un seul modèle tient en mémoire à la fois : passer d’une fonction à une autre avec un modèle différent recharge le modèle (quelques secondes).
        </Text>
        {FN_MODES.map(mode => {
          const cand = candidatesFor(mode, installed, defs);
          const chosen = s.modeModels?.[mode];
          const used = modelForMode(s.installed, s.activeModel, s.modeModels, mode);
          return (
            <View key={mode} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ fontFamily: F.bodyBold, fontWeight: '700', fontSize: 15 }}>{FN_LABEL[mode]}</Text>
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, color: C.n700 }}>{mode === 'vision' && !cand.length ? 'aucun modèle de vision' : MODELS[used] ? MODELS[used].name : 'moteur intégré'}</Text>
              </View>
              <Text style={{ fontSize: 12, lineHeight: 17, color: C.n700 }}>{FN_HINT[mode]}</Text>
              {mode === 'vision' && !cand.length ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.a700 }}>
                    Aucun modèle de vision installé. Choisissez-en un : il se télécharge avec son module image (deux fichiers, vérifiés).
                  </Text>
                  {visionCatalog.map(v => (
                    <View key={v.id} style={{ borderRadius: 16, backgroundColor: C.surface, padding: 10, gap: 4 }}>
                      <Text style={{ fontWeight: '700', fontSize: 14, fontFamily: F.bodyBold }}>{v.name}</Text>
                      <Text style={{ fontSize: 12, lineHeight: 17, color: C.n700 }}>{v.explain}</Text>
                      <Text style={{ fontSize: 12, color: C.n700 }}>{fmtGo((v.sizeBytes + (v.mmproj?.sizeBytes || 0)) / 1e9)} · mémoire conseillée {String(v.needRamGb).replace('.', ',')} Go · {v.license}</Text>
                      {onInstall ? <Btn kind="secondary" title="Installer" height={40} fontSize={13.5} style={{ alignSelf: 'flex-start' }} onPress={() => onInstall(v.id)} /> : null}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {[null, ...cand].map(id => {
                    const on = (chosen ?? null) === id;
                    return (
                      <TouchableOpacity key={id ?? 'auto'} onPress={() => choose(mode, id)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                        style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: on ? C.a200 : C.surface, justifyContent: 'center', maxWidth: '100%' }}>
                        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? C.a800 : C.n800 }}>{id ? MODELS[id].name : 'Modèle actif'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
        {installed.length === 0 ? <Text style={{ fontSize: 12.5, color: C.n700 }}>Installez d’abord un modèle ci-dessous.</Text> : null}
      </View>
    </View>
  );
}
