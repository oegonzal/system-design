import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { isUnder, navTable } from './nav-table';
import { RouteAnnouncer } from './route-announcer';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
// eslint-disable-next-line @eslint-react/hooks-extra/no-unnecessary-use-prefix -- the mock mirrors next/navigation's hook name
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

const { navItemFor, pageMetadata } = navTable(
  [
    { href: '/', label: 'Home', description: 'The start.' },
    { href: '/items', label: 'Items', description: 'Every item.' },
  ],
  [{ href: '/detail', label: 'Detail', description: 'One item.' }],
);

describe('navigation', () => {
  it('puts a pathname under its own route and the routes above it, the root only under itself', () => {
    expect(isUnder('/items', '/items')).toBe(true);
    expect(isUnder('/items/7', '/items')).toBe(true);
    expect(isUnder('/itemsets', '/items')).toBe(false);
    expect(isUnder('/', '/')).toBe(true);
    expect(isUnder('/items', '/')).toBe(false);
  });

  it('finds a pathname its row, nav items first, and titles a page from the same row', () => {
    expect(navItemFor('/items/7')?.label).toBe('Items');
    expect(navItemFor('/detail/7')?.label).toBe('Detail');
    expect(navItemFor('/nowhere')).toBeNull();
    expect(pageMetadata('/detail')).toEqual({ title: 'Detail', description: 'One item.' });
    expect(pageMetadata('/nowhere')).toEqual({});
  });

  it('announces a navigation by its label after the first render, never the first', async () => {
    const labelFor = (pathname: string) => navItemFor(pathname)?.label;
    navigation.pathname = '/';
    const { rerender } = render(<RouteAnnouncer labelFor={labelFor} />);
    expect(screen.getByRole('status').textContent).toBe('');

    navigation.pathname = '/items/7';
    await act(async () => rerender(<RouteAnnouncer labelFor={labelFor} />));
    expect(screen.getByRole('status').textContent).toBe('Navigated to Items');

    navigation.pathname = '/nowhere';
    await act(async () => rerender(<RouteAnnouncer labelFor={labelFor} />));
    expect(screen.getByRole('status').textContent).toBe('Navigated to /nowhere');
  });
});
