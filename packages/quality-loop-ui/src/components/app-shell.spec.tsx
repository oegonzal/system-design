import type * as WebTesting from '@sysdesign/web-testing';
import { renderWithTheme, resetNavigationMock, setMockPathname } from '@sysdesign/web-testing';
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NAV_ITEMS, navItemFor, pageMetadata, pageTitle } from '../app/nav';
import { AppShell } from './app-shell';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

beforeEach(() => {
  resetNavigationMock();
  // jsdom has no scrolling; the shell scrolls `main` to the top on every navigation.
  Element.prototype.scrollTo = vi.fn();
});

describe('the shell', () => {
  it('[QLU-5] names every route once as data — the nav, the current route and each page title', () => {
    setMockPathname('/inspect');
    renderWithTheme(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav.querySelectorAll('a').length).toBe(NAV_ITEMS.length);
    expect(screen.getByRole('link', { name: 'Inspect' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Run' }).hasAttribute('aria-current')).toBe(false);
    expect(screen.getByRole('main').textContent).toContain('content');

    // The titles come off the same rows, so a nav label and a page title cannot drift.
    expect(pageMetadata('/inspect')).toEqual({
      title: { absolute: 'Inspect · Quality loop' },
      description: expect.stringContaining('lens'),
    });
    // The run page sits in the root layout's own segment, where the layout's
    // template never applies — so its title carries the app's name itself.
    expect(pageMetadata('/')).toEqual({
      title: { absolute: 'Run · Quality loop' },
      description: expect.any(String),
    });
    expect(pageTitle('%s')).toBe('%s · Quality loop');
    expect(pageMetadata('/nowhere')).toEqual({});
    expect(navItemFor('/nowhere')).toBeNull();
  });

  it('[QLU-5] announces a navigation after the first render, never the first', async () => {
    setMockPathname('/');
    const { rerender } = renderWithTheme(<AppShell />);
    expect(screen.getByRole('status').textContent).toBe('');
    setMockPathname('/inspect');
    await act(async () => {
      rerender(<AppShell />);
    });
    // The announcer empties the region and speaks on the next task, so that two
    // navigations reading the same are two mutations rather than no change.
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Navigated to Inspect'),
    );
  });
});
