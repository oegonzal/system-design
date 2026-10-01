import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { isUnder, navTable } from './nav-table';
import { RouteAnnouncer } from './route-announcer';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
// eslint-disable-next-line @eslint-react/hooks-extra/no-unnecessary-use-prefix -- the mock mirrors next/navigation's hook name
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

const { navItemFor, pageMetadata, titled } = navTable(
  [
    { href: '/', label: 'Home', description: 'The start.' },
    { href: '/items', label: 'Items', description: 'Every item.' },
  ],
  [
    { href: '/detail', label: 'Detail', description: 'One item.' },
    { href: '/items/[itemId]', label: 'Item', description: 'One item, by id.' },
    { href: '/items/new', label: 'New item', description: 'Write one.' },
  ],
  { appName: 'Test App' },
);

describe('navigation', () => {
  it('puts a pathname under its own route and the routes above it, the root only under itself', () => {
    expect(isUnder('/items', '/items')).toBe(true);
    expect(isUnder('/items/7', '/items')).toBe(true);
    expect(isUnder('/itemsets', '/items')).toBe(false);
    expect(isUnder('/', '/')).toBe(true);
    expect(isUnder('/items', '/')).toBe(false);
  });

  it('gives a pathname its most specific row: the exact route, a fixed segment before a dynamic one, then the longest above it', () => {
    expect(navItemFor('/items')?.label).toBe('Items');
    // Exact beats the nav row it sits under, wherever the rows are declared.
    expect(navItemFor('/items/new')?.label).toBe('New item');
    // A dynamic segment names any one segment, and outranks the route above it.
    expect(navItemFor('/items/7')?.label).toBe('Item');
    // Deeper than any row: the longest row above it.
    expect(navItemFor('/items/7/history')?.label).toBe('Item');
    expect(navItemFor('/detail/7')?.label).toBe('Detail');
    expect(navItemFor('/')?.label).toBe('Home');
    expect(navItemFor('/itemsets')).toBeNull();
    expect(navItemFor('/nowhere')).toBeNull();
  });

  it('titles every page from the same row, carrying the app name on every route — the root included', () => {
    expect(pageMetadata('/')).toEqual({
      title: { absolute: 'Home · Test App' },
      description: 'The start.',
    });
    expect(pageMetadata('/items/[itemId]')).toEqual({
      title: { absolute: 'Item · Test App' },
      description: 'One item, by id.',
    });
    expect(pageMetadata('/nowhere')).toEqual({});
    expect(titled('Order history')).toBe('Order history · Test App');

    const bare = navTable([{ href: '/', label: 'Home', description: 'The start.' }]);
    expect(bare.pageMetadata('/')).toEqual({ title: 'Home', description: 'The start.' });
    expect(bare.titled('Home')).toBe('Home');
  });

  it('announces every navigation by its label after the first render — the same words twice included — never the first', async () => {
    const labelFor = (pathname: string) => navItemFor(pathname)?.label;
    const region = () => screen.getByRole('status');
    const changes: string[] = [];
    navigation.pathname = '/';
    const { rerender } = render(<RouteAnnouncer labelFor={labelFor} />);
    expect(region().textContent).toBe('');
    const observer = new MutationObserver(() => changes.push(region().textContent ?? ''));
    observer.observe(region(), { childList: true, characterData: true, subtree: true });

    navigation.pathname = '/items/7';
    await act(async () => rerender(<RouteAnnouncer labelFor={labelFor} />));
    await waitFor(() => expect(region().textContent).toBe('Navigated to Item'));

    // Another item reads the same; it is still a change the region announces.
    const before = changes.length;
    navigation.pathname = '/items/8';
    await act(async () => rerender(<RouteAnnouncer labelFor={labelFor} />));
    await waitFor(() => expect(changes.slice(before)).toContain('Navigated to Item'));

    navigation.pathname = '/items/new';
    await act(async () => rerender(<RouteAnnouncer labelFor={labelFor} />));
    await waitFor(() => expect(region().textContent).toBe('Navigated to New item'));

    navigation.pathname = '/nowhere';
    await act(async () => rerender(<RouteAnnouncer labelFor={labelFor} />));
    await waitFor(() => expect(region().textContent).toBe('Navigated to /nowhere'));
    observer.disconnect();
  });
});
