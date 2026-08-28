import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { VisuallyHidden } from './visually-hidden';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('VisuallyHidden', () => {
  it('keeps its content in the document for assistive technology', () => {
    renderWithTheme(<VisuallyHidden>Remove node</VisuallyHidden>);
    // Present and queryable — clipped, not display:none.
    expect(screen.getByText('Remove node')).toBeTruthy();
  });

  it('renders a span by default', () => {
    renderWithTheme(<VisuallyHidden>label</VisuallyHidden>);
    expect(screen.getByText('label').tagName).toBe('SPAN');
  });

  it('swaps the tag with as, keeping semantics', () => {
    renderWithTheme(<VisuallyHidden as="h2">Hidden heading</VisuallyHidden>);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toBe('Hidden heading');
    expect(heading.hasAttribute('as')).toBe(false);
  });
});
