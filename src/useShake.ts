/* Hook de secousse : écoute l'accéléromètre (expo-sensors, compatible Expo Go) à ~80 ms,
   uniquement quand `enabled` ET que l'app est au premier plan ; nettoie l'abonnement. */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { createShakeDetector, type ShakeOpts } from './shake';

export function useShake(onShake: () => void, opts: { enabled?: boolean; interval?: number; detector?: Partial<ShakeOpts> } = {}) {
  const { enabled = true, interval = 80, detector } = opts;
  const cb = useRef(onShake);
  cb.current = onShake;
  const detKey = JSON.stringify(detector || {});

  useEffect(() => {
    if (!enabled) return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    const det = createShakeDetector(detector);

    const start = async () => {
      if (sub || cancelled) return;
      try {
        if (!(await Accelerometer.isAvailableAsync()) || cancelled || sub) return;
        Accelerometer.setUpdateInterval(interval);
        det.reset();
        sub = Accelerometer.addListener(({ x, y, z }) => { if (det.push(x, y, z, Date.now())) cb.current(); });
      } catch { /* capteur indisponible : aucune réaction, aucune erreur */ }
    };
    const stop = () => { sub?.remove(); sub = null; };

    if (AppState.currentState === 'active') void start();
    const as = AppState.addEventListener('change', s => { if (s === 'active') void start(); else stop(); });
    return () => { cancelled = true; as.remove(); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, interval, detKey]);
}
