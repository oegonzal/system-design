import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as stories from './registration-panel.stories';

const { Stored, NotLookedUp, Pending, Unknown } = composeStories(stories);

describe('RegistrationPanel', () => {
  it('[GOVU-19] shows a stored registration, says when none is stored, and puts the cost of a lookup on the button that spends it', () => {
    const onLookup = vi.fn();
    const stored = renderWithTheme(<Stored onLookup={onLookup} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('PRECISION PARTS CO');
    fireEvent.click(
      screen.getByRole('button', { name: 'Look up again — 1 request (1 per 100 UEIs)' }),
    );
    expect(onLookup).toHaveBeenCalledTimes(1);
    stored.unmount();

    const none = renderWithTheme(<NotLookedUp />);
    expect(screen.getByText(/No registration is stored for ABC123DEF456/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Look up — 1 request (1 per 100 UEIs)' }),
    ).toBeTruthy();
    none.unmount();

    const pending = renderWithTheme(<Pending />);
    expect(
      (screen.getByRole('button', { name: 'Looking up…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    pending.unmount();

    renderWithTheme(<Unknown />);
    expect(screen.getByRole('alert').textContent).toBe('SAM.gov knows no registrant ABC123DEF456.');
  });
});
