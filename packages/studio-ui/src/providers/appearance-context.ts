'use client';

import {
  DEFAULT_APPEARANCE_SETTINGS,
  type Accent,
  type AppearanceSettings,
  type ColorMode,
  type MotionLevel,
} from '@sysdesign/contracts';
import { createContext, use } from 'react';

/**
 * Value/actions context split: the actions object is memoized once and never
 * changes identity, so a component that only *sets* appearance (the settings
 * page's buttons) re-renders on clicks, not on every theme change elsewhere.
 */

export const AppearanceValueContext = createContext<AppearanceSettings>(
  DEFAULT_APPEARANCE_SETTINGS,
);

export interface AppearanceActions {
  setColorMode(colorMode: ColorMode): void;
  setAccent(accent: Accent): void;
  setMotion(motion: MotionLevel): void;
}

export const AppearanceActionsContext = createContext<AppearanceActions | null>(null);

export function useAppearance(): AppearanceSettings {
  return use(AppearanceValueContext);
}

export function useAppearanceActions(): AppearanceActions {
  const actions = use(AppearanceActionsContext);
  if (!actions) {
    throw new Error('useAppearanceActions must be used inside <AppearanceProvider>');
  }
  return actions;
}
