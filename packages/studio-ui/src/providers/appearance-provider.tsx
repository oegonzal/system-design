'use client';

import {
  ACCENTS,
  COLOR_MODES,
  DEFAULT_APPEARANCE_SETTINGS,
  MOTION_LEVELS,
  type AppearanceSettings,
} from '@sysdesign/contracts';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  AppearanceActionsContext,
  AppearanceValueContext,
  type AppearanceActions,
} from './appearance-context';

export const APPEARANCE_STORAGE_KEY = 'sds.appearance';

/**
 * Validated read: only values present in the contract tuples survive. A
 * tampered or stale payload degrades field-by-field to the defaults rather
 * than poisoning the theme (an unknown accent would otherwise become an
 * `undefined` ramp lookup deep in `createTheme`).
 */
export function readStoredAppearance(): AppearanceSettings {
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (raw === null) return DEFAULT_APPEARANCE_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return DEFAULT_APPEARANCE_SETTINGS;
    const candidate = parsed as Record<string, unknown>;
    return {
      colorMode:
        COLOR_MODES.find((mode) => mode === candidate['colorMode']) ??
        DEFAULT_APPEARANCE_SETTINGS.colorMode,
      accent:
        ACCENTS.find((accent) => accent === candidate['accent']) ??
        DEFAULT_APPEARANCE_SETTINGS.accent,
      motion:
        MOTION_LEVELS.find((level) => level === candidate['motion']) ??
        DEFAULT_APPEARANCE_SETTINGS.motion,
    };
  } catch {
    return DEFAULT_APPEARANCE_SETTINGS;
  }
}

export interface AppearanceProviderProps {
  children?: ReactNode;
}

/**
 * Owns the appearance settings and their localStorage persistence.
 *
 * State starts at the defaults and loads from storage in an effect — the
 * first client render therefore matches the server render, so hydration is
 * clean; the pre-paint script in layout.tsx covers the visual gap at the
 * document level. Persistence skips that initial hydration pass so a fresh
 * mount can never overwrite a stored preference with the defaults.
 */
export function AppearanceProvider({ children }: AppearanceProviderProps) {
  const [settings, setSettings] = useState<AppearanceSettings>(DEFAULT_APPEARANCE_SETTINGS);
  const hydrated = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect -- deliberate post-hydration storage read; see the doc comment
    setSettings(readStoredAppearance());
  }, []);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage full or blocked — the in-memory setting still applies.
    }
  }, [settings]);

  const actions = useMemo<AppearanceActions>(
    () => ({
      setColorMode: (colorMode) => setSettings((current) => ({ ...current, colorMode })),
      setAccent: (accent) => setSettings((current) => ({ ...current, accent })),
      setMotion: (motion) => setSettings((current) => ({ ...current, motion })),
    }),
    [],
  );

  return (
    <AppearanceActionsContext value={actions}>
      <AppearanceValueContext value={settings}>{children}</AppearanceValueContext>
    </AppearanceActionsContext>
  );
}
