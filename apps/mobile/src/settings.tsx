import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SERVER_URL } from './config';
import { haptics } from './haptics';
import { cartoonTheme } from './render/cartoon';
import { classicTheme } from './render/classic';
import type { Theme, ThemeId } from './render/theme';
import { sounds } from './sound';

export type QualitySetting = 'auto' | 'high' | 'low';

export interface Settings {
  name: string;
  theme: ThemeId;
  sound: boolean;
  haptics: boolean;
  quality: QualitySetting;
  showFps: boolean;
  serverUrl: string;
}

const DEFAULTS: Settings = {
  name: '',
  theme: 'cartoon',
  sound: true,
  haptics: true,
  quality: 'auto',
  showFps: false,
  serverUrl: DEFAULT_SERVER_URL,
};

const KEY = 'bombarossa.settings.v1';
export const THEMES: Record<ThemeId, Theme> = { cartoon: cartoonTheme, classic: classicTheme };

interface Ctx {
  settings: Settings;
  loaded: boolean;
  theme: Theme;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Settings>;
          setSettings({ ...DEFAULTS, ...saved, serverUrl: saved.serverUrl || DEFAULTS.serverUrl });
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Keep the singletons in sync with the settings.
  useEffect(() => {
    sounds.enabled = settings.sound;
    haptics.enabled = settings.haptics;
  }, [settings.sound, settings.haptics]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({ settings, loaded, theme: THEMES[settings.theme] ?? cartoonTheme, update }),
    [settings, loaded, update],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
