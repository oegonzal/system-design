import { composeStories } from '@storybook/react';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Link } from './link';
import * as stories from './link.stories';

const { Inline, Nav, Card } = composeStories(stories);
const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Link', () => {
  it('renders an anchor with its href and keeps the style props off the DOM', () => {
    renderWithTheme(
      <Link href="/notices/n-1" $variant="card" $active>
        open
      </Link>,
    );
    const link = screen.getByRole('link', { name: 'open' });
    expect(link.getAttribute('href')).toBe('/notices/n-1');
    for (const attr of ['$variant', '$active', 'variant', 'active']) {
      expect(link.hasAttribute(attr)).toBe(false);
    }
  });

  it('renders every variant, and the current nav item says so', () => {
    renderWithTheme(<Inline />);
    expect(screen.getByRole('link', { name: 'the notice on sam.gov' })).toBeTruthy();
    renderWithTheme(<Nav />);
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Search' }).hasAttribute('aria-current')).toBe(false);
    const { container } = renderWithTheme(<Card />);
    expect(container.querySelectorAll('a')).toHaveLength(2);
  });

  it('routes through another component with the same styles', () => {
    const Routed = Link.withComponent('button');
    renderWithTheme(<Routed $variant="nav">go</Routed>);
    expect(screen.getByRole('button', { name: 'go' }).hasAttribute('$variant')).toBe(false);
  });
});
