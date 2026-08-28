import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Button } from '../button/button';
import { Toolbar } from './toolbar';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Toolbar', () => {
  it('exposes role="toolbar" with an accessible name', () => {
    renderWithTheme(
      <Toolbar aria-label="Canvas controls">
        <Button>Add node</Button>
      </Toolbar>,
    );
    expect(screen.getByRole('toolbar', { name: 'Canvas controls' })).toBeTruthy();
  });

  it('renders its controls in order', () => {
    renderWithTheme(
      <Toolbar aria-label="Canvas controls">
        <Button>Add node</Button>
        <Button>Add edge</Button>
      </Toolbar>,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Add node', 'Add edge']);
  });

  it('keeps the gap prop off the DOM', () => {
    renderWithTheme(<Toolbar aria-label="Controls" gap={5} />);
    const toolbar = screen.getByRole('toolbar');
    for (const attr of ['gap', '$gap']) {
      expect(toolbar.hasAttribute(attr)).toBe(false);
    }
  });
});
