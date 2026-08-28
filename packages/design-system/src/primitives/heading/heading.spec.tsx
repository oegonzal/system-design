import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Heading } from './heading';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Heading', () => {
  it('defaults to a section heading, not a page title', () => {
    renderWithTheme(<Heading>Findings</Heading>);
    expect(screen.getByRole('heading', { level: 2 }).tagName).toBe('H2');
  });

  it('renders the element its level names', () => {
    renderWithTheme(
      <>
        <Heading level={1}>one</Heading>
        <Heading level={3}>three</Heading>
        <Heading level={4}>four</Heading>
      </>,
    );
    expect(screen.getByRole('heading', { level: 1 }).tagName).toBe('H1');
    expect(screen.getByRole('heading', { level: 3 }).tagName).toBe('H3');
    expect(screen.getByRole('heading', { level: 4 }).tagName).toBe('H4');
  });

  it('keeps level and its transient form off the DOM', () => {
    renderWithTheme(<Heading level={3}>Findings</Heading>);
    const heading = screen.getByRole('heading');
    for (const attr of ['level', '$level', 'as']) {
      expect(heading.hasAttribute(attr)).toBe(false);
    }
  });
});
