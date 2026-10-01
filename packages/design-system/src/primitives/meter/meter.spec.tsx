import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

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

  it('prints whole points by default, and says nothing extra to a screen reader', () => {
    renderWithTheme(<Meter label="Coverage" value={79.5} />);
    expect(screen.getByText('80')).toBeTruthy();
    expect(screen.getByRole('meter').hasAttribute('aria-valuetext')).toBe(false);
  });

  it('prints the value through a formatter it is given, on screen and to a screen reader', () => {
    const formatValue = vi.fn((value: number) => `${value.toFixed(1)} pts`);
    renderWithTheme(<Meter label="Coverage" value={104.26} formatValue={formatValue} />);

    // The formatter sees the clamped value, unrounded; the bar stays whole.
    expect(formatValue).toHaveBeenCalledWith(100);
    expect(screen.getByText('100.0 pts')).toBeTruthy();
    const meter = screen.getByRole('meter', { name: 'Coverage' });
    expect(meter.getAttribute('aria-valuetext')).toBe('100.0 pts');
    expect(meter.getAttribute('aria-valuenow')).toBe('100');

    renderWithTheme(<Meter label="Latency" value={42.26} formatValue={formatValue} />);
    expect(screen.getByText('42.3 pts')).toBeTruthy();
  });
});
