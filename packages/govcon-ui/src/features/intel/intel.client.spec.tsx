import type * as WebTesting from '@sysdesign/web-testing';
import {
  renderWithTheme,
  resetNavigationMock,
  stubApi,
  type StubRoute,
} from '@sysdesign/web-testing';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileProvider } from '../../providers/profile-context';
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
];

const mount = () =>
  renderWithTheme(
    <ProfileProvider>
      <IntelClient />
    </ProfileProvider>,
  );

beforeEach(() => resetNavigationMock());
afterEach(() => vi.unstubAllGlobals());

describe('IntelClient', () => {
  it('[GOVU-9] lists and summarizes the stored awards over the filters, then fetches from the chosen sources and reads the store again', async () => {
    const { calls, fetchMock } = stubApi([
      ...baseRoutes(),
      { method: 'POST', path: '/awards/fetch', body: { data: FETCH_REPORT } },
    ]);
    mount();
    await screen.findByRole('table', { name: 'Awards' });
    expect(screen.getByText('$156,000')).toBeTruthy();
    expect(calls.map((call) => call.url)).toEqual(
      expect.arrayContaining(['/awards?limit=50&offset=0', '/awards/summary']),
    );

    fireEvent.click(screen.getByRole('button', { name: '332710' }));
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
    mount();
    await screen.findByRole('table', { name: 'Awards' });
    fireEvent.click(screen.getByRole('button', { name: 'Look up (1 request)' }));
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
});
