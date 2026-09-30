import { composeStories } from '@storybook/react';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { ALERT_ROLE, Alert } from './alert';
import * as stories from './alert.stories';

const { Danger, Success, AllTones } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Alert', () => {
  it('interrupts for danger and warnings, waits for success and info', () => {
    expect(ALERT_ROLE).toEqual({
      danger: 'alert',
      warn: 'alert',
      success: 'status',
      info: 'status',
    });
    renderWithTheme(<Danger />);
    expect(screen.getByRole('alert').textContent).toContain('Description not fetched');
    expect(screen.getByRole('alert').textContent).toContain('rate-limited: over quota');
    renderWithTheme(<Success />);
    expect(screen.getByRole('status').textContent).toContain('Profile saved');
  });

  it('renders every tone and keeps the tone off the DOM', () => {
    renderWithTheme(<AllTones />);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getAllByRole('status')).toHaveLength(2);
    renderWithTheme(<Alert tone="info">plain</Alert>);
    const alert = screen.getByText('plain');
    expect(alert.hasAttribute('tone')).toBe(false);
    expect(alert.hasAttribute('$tone')).toBe(false);
  });
});
