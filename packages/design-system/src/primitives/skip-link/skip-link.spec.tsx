import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { SkipLink } from './skip-link';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('SkipLink', () => {
  it('renders an anchor pointing at the main content', () => {
    renderWithTheme(<SkipLink href="#main">Skip to canvas</SkipLink>);
    const link = screen.getByRole('link', { name: 'Skip to canvas' });
    expect(link.getAttribute('href')).toBe('#main');
  });

  it('stays in the tab order — hidden by transform, not display', () => {
    renderWithTheme(<SkipLink href="#main">Skip to canvas</SkipLink>);
    const link = screen.getByRole('link');
    link.focus();
    expect(document.activeElement).toBe(link);
  });
});
