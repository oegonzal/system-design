import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Meter } from './meter';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Meter', () => {
  it('exposes role="meter" named by its visible label', () => {
    renderWithTheme(<Meter label="Reliability" value={74} />);
    const meter = screen.getByRole('meter', { name: 'Reliability' });
    expect(meter.getAttribute('aria-valuenow')).toBe('74');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
  });

  it('shows the value as text beside the label', () => {
    renderWithTheme(<Meter label="Security" value={90} />);
    expect(screen.getByText('90')).toBeTruthy();
    expect(screen.getByText('Security')).toBeTruthy();
  });

  it('clamps out-of-range values rather than throwing', () => {
    const { unmount } = renderWithTheme(<Meter label="Overall" value={103} />);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('100');
    unmount();

    renderWithTheme(<Meter label="Overall" value={-4} />);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('0');
  });

  it('accepts an explicit tone for inverted scales', () => {
    renderWithTheme(<Meter label="Queue depth" value={92} tone="danger" />);
    expect(screen.getByRole('meter', { name: 'Queue depth' })).toBeTruthy();
  });
});
