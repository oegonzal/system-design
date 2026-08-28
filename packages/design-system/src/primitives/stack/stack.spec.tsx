import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Stack } from './stack';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Stack', () => {
  it('renders a div by default', () => {
    renderWithTheme(<Stack data-testid="stack">content</Stack>);
    expect(screen.getByTestId('stack').tagName).toBe('DIV');
  });

  it('swaps the tag with as, keeping list semantics real', () => {
    renderWithTheme(
      <Stack as="ul">
        <li>gateway</li>
        <li>service</li>
      </Stack>,
    );
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('does not leak as or the style props onto the DOM', () => {
    renderWithTheme(
      <Stack data-testid="stack" as="nav" direction="row" gap={4} align="center" wrap>
        content
      </Stack>,
    );
    const stack = screen.getByTestId('stack');
    expect(stack.tagName).toBe('NAV');
    for (const attr of ['as', 'direction', 'gap', 'align', 'justify', 'wrap']) {
      expect(stack.hasAttribute(attr)).toBe(false);
    }
  });

  it('forwards a ref to the rendered element', () => {
    let node: HTMLElement | null = null;
    renderWithTheme(
      <Stack
        as="section"
        ref={(element) => {
          node = element;
        }}
      >
        content
      </Stack>,
    );
    expect(node).not.toBeNull();
    expect((node as unknown as HTMLElement).tagName).toBe('SECTION');
  });
});
