import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FailureDetail } from './failure-detail';

describe('FailureDetail', () => {
  it('keeps a run’s own error folded under a control anyone can open, and wraps it inside the dock', async () => {
    renderWithTheme(<FailureDetail detail="connect ECONNREFUSED 127.0.0.1:3003" />);

    const toggle = screen.getByRole('button', { name: 'Technical details' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const line = screen.getByText('connect ECONNREFUSED 127.0.0.1:3003');
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(panel?.contains(line)).toBe(true);
    expect(panel?.hidden).toBe(true);
    expect(getComputedStyle(line).overflowWrap).toBe('anywhere');

    // The design system's disclosure: its button is the control, by pointer or keyboard.
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.hidden).toBe(false);
  });

  it('can be shown from the start', () => {
    renderWithTheme(<FailureDetail detail="the model went away" defaultOpen />);
    expect(
      screen.getByRole('button', { name: 'Technical details' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });
});
