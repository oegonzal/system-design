import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ThemeRoot } from '../../theme-root';
import { Badge } from './badge';

const renderWithTheme = (ui: ReactElement) => render(ui, { wrapper: ThemeRoot });

describe('Badge', () => {
  it('renders its content in a bare span with no role', () => {
    renderWithTheme(<Badge>3 findings</Badge>);
    const badge = screen.getByText('3 findings');
    expect(badge.tagName).toBe('SPAN');
    // No role: a page of chips must not each announce themselves.
    expect(badge.hasAttribute('role')).toBe(false);
  });

  it('accepts a severity as tone', () => {
    renderWithTheme(<Badge tone="critical">critical</Badge>);
    expect(screen.getByText('critical')).toBeTruthy();
  });

  it('accepts a node kind for canvas identity chips', () => {
    renderWithTheme(<Badge kind="event-stream">event-stream</Badge>);
    expect(screen.getByText('event-stream')).toBeTruthy();
  });

  it('keeps style-only props off the DOM', () => {
    renderWithTheme(
      <Badge tone="high" kind="queue">
        chip
      </Badge>,
    );
    const badge = screen.getByText('chip');
    for (const attr of ['tone', 'kind', '$tone', '$kind']) {
      expect(badge.hasAttribute(attr)).toBe(false);
    }
  });
});
