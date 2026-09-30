import type * as WebTesting from '@sysdesign/web-testing';
import {
  renderWithTheme,
  resetNavigationMock,
  setMockPathname,
  stubApi,
} from '@sysdesign/web-testing';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NAV_ITEMS, navItemFor, pageMetadata } from '../app/nav';
import { ProfileProvider, PROFILE_STORAGE_KEY } from '../providers/profile-context';
import { OTHER_PROFILE, PROFILE } from '../testing/fixtures';
import { AppShell } from './app-shell';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

beforeEach(() => {
  resetNavigationMock();
  window.localStorage.clear();
  // jsdom has no scrolling; the shell scrolls `main` to the top on every navigation.
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

describe('the shell', () => {
  it('[GOVU-5] names every route in the nav as data, marks the current one, and titles pages from the same table', async () => {
    stubApi([{ path: '/profiles', body: { data: [PROFILE, OTHER_PROFILE] } }]);
    setMockPathname('/pipeline');
    renderWithTheme(
      <ProfileProvider>
        <AppShell>
          <p>content</p>
        </AppShell>
      </ProfileProvider>,
    );
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav.querySelectorAll('a').length).toBe(NAV_ITEMS.length);
    expect(screen.getByRole('link', { name: 'Pipeline' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Search' }).hasAttribute('aria-current')).toBe(false);
    expect(screen.getByRole('main').textContent).toContain('content');
    expect(pageMetadata('/intel')).toEqual({
      title: 'Intel',
      description: expect.stringContaining('Awards'),
    });
    expect(navItemFor('/notices/abc')?.label).toBe('Notice');
    expect(navItemFor('/nowhere')).toBeNull();

    // The profile choice: the default first, then the one chosen, remembered across a reload.
    const select = (await screen.findByLabelText('Profile')) as HTMLSelectElement;
    expect(select.value).toBe('enfav');
    fireEvent.change(select, { target: { value: 'other' } });
    expect(select.value).toBe('other');
    expect(window.localStorage.getItem(PROFILE_STORAGE_KEY)).toBe('other');
  });

  it('[GOVU-5] announces a navigation after the first render, never the first', async () => {
    stubApi([{ path: '/profiles', body: { data: [PROFILE] } }]);
    const shell = () => (
      <ProfileProvider>
        <AppShell />
      </ProfileProvider>
    );
    setMockPathname('/');
    const { rerender } = renderWithTheme(shell());
    expect(screen.getByRole('status').textContent).toBe('');
    setMockPathname('/notices/abc');
    await act(async () => {
      rerender(shell());
    });
    expect(screen.getByRole('status').textContent).toBe('Navigated to Notice');
  });
});
