import type * as WebTesting from '@sysdesign/web-testing';
import {
  renderWithTheme,
  resetNavigationMock,
  routerMock,
  setMockSearchParams,
  stubApi,
  type StubRoute,
} from '@sysdesign/web-testing';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileProvider } from '../../providers/profile-context';
import { followAddress } from '../../testing/address';
import { AWARDS, AWARDS_SUMMARY, ENTITY, OWN_ENTITY, PROFILE } from '../../testing/fixtures';
import { LOOKUP } from './entity-table.stories';
import { FETCH_REPORT } from './fetch-awards-form.stories';
import { IntelClient } from './intel.client';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

const meta = { total: 3, limit: 50, offset: 0 };
const baseRoutes = (): StubRoute[] => [
  { path: '/profiles', body: { data: [PROFILE] } },
  { path: '/awards', body: { data: AWARDS, meta } },
  { path: '/awards/summary', body: { data: AWARDS_SUMMARY } },
  { path: '/entities/own', body: { data: OWN_ENTITY } },
  { path: '/profiles/enfav/views', body: { data: [] } },
];

const page = () => (
  <ProfileProvider>
    <IntelClient />
  </ProfileProvider>
);
const mount = () => renderWithTheme(page());

beforeEach(() => resetNavigationMock());
afterEach(() => vi.unstubAllGlobals());

describe('IntelClient', () => {
  it('[GOVU-9] [GOVU-23] lists and summarizes the stored awards over the filters the address names, a filter replacing the address, then fetches from the chosen sources and reads the store again', async () => {
    const { calls, fetchMock } = stubApi([
      ...baseRoutes(),
      { method: 'POST', path: '/awards/fetch', body: { data: FETCH_REPORT } },
    ]);
    const view = mount();
    await screen.findByRole('table', { name: 'Awards' });
    expect(screen.getByText('$156,000')).toBeTruthy();
    expect(calls.map((call) => call.url)).toEqual(
      expect.arrayContaining(['/awards?limit=50&offset=0', '/awards/summary']),
    );

    fireEvent.click(screen.getByRole('button', { name: '332710' }));
    expect(followAddress()).toBe('/intel?naics=332710');
    view.rerender(page());
    await waitFor(() => {
      expect(calls.map((call) => call.url)).toContain('/awards?naics=332710&limit=50&offset=0');
      expect(calls.map((call) => call.url)).toContain('/awards/summary?naics=332710');
    });
    const before = calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    await screen.findByRole('table', { name: 'Fetch report' });
    const fetched = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/awards/fetch'));
    expect(JSON.parse(String((fetched?.[1] as RequestInit).body))).toMatchObject({
      naics: ['332710', '333249', '541511', '541512'],
      sources: ['sam.gov', 'usaspending'],
    });
    await waitFor(() => {
      expect(calls.slice(before).map((call) => call.url)).toEqual(
        expect.arrayContaining([
          '/awards?naics=332710&limit=50&offset=0',
          '/awards/summary?naics=332710',
        ]),
      );
    });
    expect(screen.getByText(/Fetched: 285 new award\(s\) stored/)).toBeTruthy();
  });

  it('[GOVU-9] looks registrants up from the entities tab and from a top awardee, showing the exclusion flag and the own registration', async () => {
    const { calls, fetchMock } = stubApi([
      ...baseRoutes(),
      { method: 'POST', path: '/entities/lookup', body: { data: LOOKUP } },
    ]);
    const view = mount();
    await screen.findByRole('table', { name: 'Awards' });
    fireEvent.click(screen.getByRole('button', { name: 'Look up (1 request)' }));
    // The lookup lands on the other side, which the page asks its address for.
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenLastCalledWith('/intel?tab=entities', { scroll: false }),
    );
    followAddress();
    view.rerender(page());
    const registrants = await screen.findByRole('table', { name: 'Registrants' });
    expect(within(registrants).getByText('excluded')).toBeTruthy();
    const looked = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith('/entities/lookup'),
    );
    expect(JSON.parse(String((looked?.[1] as RequestInit).body))).toEqual({
      ueis: ['ABC123DEF456'],
    });
    expect(screen.getByRole('tab', { name: 'Entities' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('heading', { name: 'ENFAV LLC' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/UEIs/), {
      target: { value: `${ENTITY.uei}\nZZZ000000001` },
    });
    fireEvent.click(screen.getByRole('button', { name: /Look up — 1 request/ }));
    await waitFor(() => {
      expect(calls.filter((call) => call.method === 'POST')).toHaveLength(2);
    });
    expect(screen.getByText(/Not in the registry: ZZZ000000001/)).toBeTruthy();
  });

  it('shows a failed panel beside its data and keeps the rest', async () => {
    stubApi([
      { path: '/profiles', body: { data: [PROFILE] } },
      { path: '/awards', status: 500, body: { statusCode: 500, message: 'the store is down' } },
      { path: '/awards/summary', body: { data: AWARDS_SUMMARY } },
      { path: '/entities/own', body: { data: null } },
    ]);
    mount();
    expect((await screen.findByRole('alert')).textContent).toBe('the store is down');
    expect(await screen.findByText('$156,000')).toBeTruthy();
  });

  it('[GOVU-23] opens on the side, the filters and the page its address names, and keeps the reading by name as that address', async () => {
    const { calls, fetchMock } = stubApi([
      ...baseRoutes().filter((route) => route.path !== '/profiles/enfav/views'),
      { path: '/profiles/enfav/views', body: { data: [] } },
      { method: 'PUT', path: '/profiles/enfav/views', body: { data: { id: 'v-1' } } },
    ]);
    setMockSearchParams('naics=5415&source=usaspending&offset=50');
    mount();
    await screen.findByRole('table', { name: 'Awards' });
    expect(calls.map((call) => call.url)).toEqual(
      expect.arrayContaining([
        '/awards?naics=5415&source=usaspending&limit=50&offset=50',
        '/awards/summary?naics=5415&source=usaspending',
      ]),
    );
    expect((screen.getByLabelText('Source') as HTMLSelectElement).value).toBe('usaspending');

    fireEvent.change(await screen.findByLabelText('Save this view as'), {
      target: { value: 'Software awards' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save view' }));
    await waitFor(() =>
      expect(calls.map((call) => `${call.method} ${call.url}`)).toContain(
        'PUT /profiles/enfav/views',
      ),
    );
    const put = fetchMock.mock.calls.find((call) => (call[1] as RequestInit).method === 'PUT');
    expect(JSON.parse(String((put?.[1] as RequestInit).body))).toEqual({
      name: 'Software awards',
      href: '/intel?naics=5415&source=usaspending&offset=50',
    });
  });
});
