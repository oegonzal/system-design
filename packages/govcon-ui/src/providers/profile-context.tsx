'use client';

import type { StoredProfile } from '@sysdesign/contracts';
import { useResource } from '@sysdesign/web-kit';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api } from '../api/client';

export const PROFILE_STORAGE_KEY = 'govcon.profile';

export interface ProfileContextValue {
  profiles: StoredProfile[];
  /** The chosen profile, else the store's default, else the first; null while loading or when there is none. */
  active: StoredProfile | null;
  setActiveId(id: string): void;
  loading: boolean;
  error: string | null;
  /** After a profile was created, edited or removed. */
  reload(): void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

const readStored = (): string | null => {
  try {
    return window.localStorage.getItem(PROFILE_STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStored = (id: string): void => {
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, id);
  } catch {
    // A blocked store only costs the choice surviving a reload.
  }
};

/**
 * Which profile every page scores against. The list comes from the service;
 * the choice lives in the browser and survives a reload; the store's default
 * stands in until a choice is made. A page reads it and never asks itself.
 */
export function ProfileProvider({ children }: { children?: ReactNode }) {
  const { data, error, loading, reload } = useResource(
    (signal) => api.listProfiles({ signal }),
    [],
  );
  const [chosen, setChosen] = useState<string | null>(null);

  // Read after mount: the server render has no localStorage, and a mismatch would be a hydration error.
  useEffect(() => {
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect -- restoring the choice is this effect
    setChosen(readStored());
  }, []);

  const setActiveId = useCallback((id: string) => {
    setChosen(id);
    writeStored(id);
  }, []);

  const value = useMemo<ProfileContextValue>(() => {
    const profiles = data ?? [];
    const active =
      profiles.find((profile) => profile.id === chosen) ??
      profiles.find((profile) => profile.isDefault) ??
      profiles[0] ??
      null;
    return { profiles, active, setActiveId, loading, error, reload };
  }, [data, chosen, setActiveId, loading, error, reload]);

  return <ProfileContext value={value}>{children}</ProfileContext>;
}

export function useProfile(): ProfileContextValue {
  const context = use(ProfileContext);
  if (!context) throw new Error('useProfile must be rendered inside <ProfileProvider>');
  return context;
}
