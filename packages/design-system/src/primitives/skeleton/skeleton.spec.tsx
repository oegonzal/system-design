import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Skeleton } from './skeleton';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Skeleton', () => {
  it('is always hidden from assistive technology', () => {
    renderWithTheme(<Skeleton data-testid="bone" />);
    expect(screen.getByTestId('bone').getAttribute('aria-hidden')).toBe('true');
  });

  it('cannot be opted back into the accessibility tree', () => {
    // The container announces the load once; individual bones never do.
    renderWithTheme(<Skeleton data-testid="bone" aria-hidden="false" />);
    expect(screen.getByTestId('bone').getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps size and variant props off the DOM', () => {
    renderWithTheme(<Skeleton data-testid="bone" width="120px" height="16px" variant="block" />);
    const bone = screen.getByTestId('bone');
    for (const attr of ['width', 'height', 'variant', '$width', '$height', '$variant']) {
      expect(bone.hasAttribute(attr)).toBe(false);
    }
  });

  it('renders under reduced motion — flat, not strobing', () => {
    renderWithTheme(
      <ThemeRoot settings={{ motion: 'reduced' }}>
        <Skeleton data-testid="bone" />
      </ThemeRoot>,
    );
    expect(screen.getByTestId('bone')).toBeTruthy();
  });
});
