import { DEFAULT_APPEARANCE_SETTINGS } from '@sysdesign/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppearance, useAppearanceActions } from './appearance-context';
import {
  APPEARANCE_STORAGE_KEY,
  AppearanceProvider,
  readStoredAppearance,
} from './appearance-provider';

/** Exposes the context and one action so specs can observe + drive it. */
function Probe() {
  const settings = useAppearance();
  const { setAccent, setColorMode } = useAppearanceActions();
  return (
    <div>
      <output data-testid="settings">{JSON.stringify(settings)}</output>
      <button type="button" onClick={() => setAccent('violet')}>
        violet
      </button>
      <button type="button" onClick={() => setColorMode('dark')}>
        dark
      </button>
    </div>
  );
}

function currentSettings() {
  return JSON.parse(screen.getByTestId('settings').textContent ?? '{}');
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('AppearanceProvider', () => {
  it('loads validated settings from localStorage after mount', async () => {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ colorMode: 'dark', accent: 'teal', motion: 'reduced' }),
    );

    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );

    await waitFor(() =>
      expect(currentSettings()).toEqual({
        colorMode: 'dark',
        accent: 'teal',
        motion: 'reduced',
      }),
    );
  });

  it('degrades invalid stored values field-by-field to the defaults', async () => {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ colorMode: 'neon', accent: 'teal', motion: 42 }),
    );

    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );

    await waitFor(() =>
      expect(currentSettings()).toEqual({
        colorMode: 'light',
        accent: 'teal',
        motion: 'full',
      }),
    );
  });

  it('survives unparseable storage payloads', () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, '{not json');
    expect(readStoredAppearance()).toEqual(DEFAULT_APPEARANCE_SETTINGS);
  });

  it('persists changes and never clobbers stored settings with defaults on mount', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ colorMode: 'dark', accent: 'slate', motion: 'full' }),
    );

    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );

    // The stored dark/slate must win over the initial defaults…
    await waitFor(() => expect(currentSettings().colorMode).toBe('dark'));

    // …and a user change persists on top of it.
    await user.click(screen.getByRole('button', { name: 'violet' }));

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? '{}')).toEqual({
        colorMode: 'dark',
        accent: 'violet',
        motion: 'full',
      }),
    );
  });
});
