import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Spinner } from './spinner';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Spinner', () => {
  it('announces as a status with its label', () => {
    renderWithTheme(<Spinner />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Loading…');
  });

  it('hides the decorative ring from assistive technology', () => {
    renderWithTheme(<Spinner data-testid="spinner" />);
    const ring = screen.getByTestId('spinner').querySelector('[aria-hidden="true"]');
    expect(ring).not.toBeNull();
  });

  it('renders no label text when a parent region already announces', () => {
    renderWithTheme(<Spinner label="" />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('still renders under the reduced motion setting', () => {
    renderWithTheme(
      <ThemeRoot settings={{ motion: 'reduced' }}>
        <Spinner label="Evaluating…" />
      </ThemeRoot>,
    );
    expect(screen.getByRole('status').textContent).toContain('Evaluating…');
  });
});
