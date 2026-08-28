import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { LiveRegion } from './live-region';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('LiveRegion', () => {
  it('announces politely as a status by default', () => {
    renderWithTheme(<LiveRegion message="Evaluation complete." />);
    expect(screen.getByRole('status').textContent).toBe('Evaluation complete.');
  });

  it('maps assertive onto role="alert"', () => {
    renderWithTheme(<LiveRegion politeness="assertive" message="Evaluation failed." />);
    expect(screen.getByRole('alert').textContent).toBe('Evaluation failed.');
  });

  it('stays mounted while silent, so a later message is actually announced', () => {
    const { rerender } = renderWithTheme(<LiveRegion message="" />);
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');

    rerender(<LiveRegion message="Node added." />);
    // Same element, new text — the mutation screen readers listen for.
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toBe('Node added.');
  });
});
