import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Surface } from './surface';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Surface', () => {
  it('renders a plain div by default', () => {
    renderWithTheme(<Surface data-testid="surface">content</Surface>);
    expect(screen.getByTestId('surface').tagName).toBe('DIV');
  });

  it('takes landmark semantics through as', () => {
    renderWithTheme(
      <Surface as="aside" aria-label="Evaluation summary">
        content
      </Surface>,
    );
    expect(screen.getByRole('complementary', { name: 'Evaluation summary' }).tagName).toBe('ASIDE');
  });

  it('keeps padding and as off the DOM', () => {
    renderWithTheme(
      <Surface data-testid="surface" as="section" padding={3}>
        content
      </Surface>,
    );
    const surface = screen.getByTestId('surface');
    expect(surface.tagName).toBe('SECTION');
    for (const attr of ['padding', '$padding', 'as']) {
      expect(surface.hasAttribute(attr)).toBe(false);
    }
  });
});
