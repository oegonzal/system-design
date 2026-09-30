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
import {
  makeLeadsReport,
  makePullReport,
  PROFILE,
  SAVED_SEARCHES,
  SOURCE_STATUS,
} from '../../testing/fixtures';
import { SearchClient } from './search.client';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

const baseRoutes = (): StubRoute[] => [
  { path: '/profiles', body: { data: [PROFILE] } },
  { path: '/source', body: { data: SOURCE_STATUS } },
  { path: '/leads', body: { data: makeLeadsReport({ matching: 30, limit: 25 }) } },
  { path: '/profiles/enfav/searches', body: { data: SAVED_SEARCHES } },
];

const mount = () =>
  renderWithTheme(
    <ProfileProvider>
      <SearchClient />
    </ProfileProvider>,
  );

const body = (
  fetchMock: ReturnType<typeof stubApi>['fetchMock'],
  suffix: string,
  method: string,
) => {
  const call = fetchMock.mock.calls.find(
    (candidate) =>
      String(candidate[0]).endsWith(suffix) && (candidate[1] as RequestInit).method === method,
  );
  return JSON.parse(String((call?.[1] as RequestInit).body)) as unknown;
};

beforeEach(() => resetNavigationMock());
afterEach(() => vi.unstubAllGlobals());

describe('SearchClient', () => {
  it('[GOVU-6] ranks the store over the filters for the active profile without a request, re-queries on a change, and pages', async () => {
    const { calls } = stubApi(baseRoutes());
    mount();
    await screen.findByRole('table', { name: 'Leads' });
    expect(calls.map((call) => call.url)).toContain(
      '/leads?profile=enfav&minScore=0&limit=25&offset=0',
    );

    fireEvent.click(screen.getByRole('button', { name: '541511' }));
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'high' } });
    await waitFor(() => {
      expect(calls.map((call) => call.url)).toContain(
        '/leads?profile=enfav&minScore=0&tier=high&naics=541511&limit=25&offset=0',
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(calls.map((call) => call.url)).toContain(
        '/leads?profile=enfav&minScore=0&tier=high&naics=541511&limit=25&offset=25',
      );
    });
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
  });

  it('[GOVU-6] runs a filter against SAM.gov for one request per page, shows the report, and saves it under a name', async () => {
    const { calls, fetchMock } = stubApi([
      ...baseRoutes(),
      { method: 'POST', path: '/searches/run', body: { data: makePullReport() } },
      { method: 'POST', path: '/profiles/enfav/searches', body: { data: SAVED_SEARCHES[0] } },
    ]);
    mount();
    fireEvent.click(await screen.findByRole('tab', { name: 'SAM.gov (spends requests)' }));
    await screen.findByRole('table', { name: 'Saved searches' });

    fireEvent.change(screen.getByLabelText('NAICS (exact code, 2–6 digits)'), {
      target: { value: '541511' },
    });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'active' } });
    fireEvent.change(screen.getByLabelText('Posted in the last N days'), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run (1 request per page)' }));
    await screen.findByRole('heading', { name: 'Pull · enfav · posted 2026-09-24 to 2026-09-26' });
    expect(body(fetchMock, '/searches/run', 'POST')).toEqual({
      profile: 'enfav',
      filter: { naics: '541511', status: 'active' },
      days: 7,
    });
    expect(screen.getByText(/Search finished: 3 of 3 attempts/)).toBeTruthy();
    // What came back was stored: the store is read again.
    await waitFor(() =>
      expect(calls.filter((call) => call.url.startsWith('/leads')).length).toBeGreaterThan(1),
    );

    fireEvent.change(screen.getByLabelText('Save as'), { target: { value: 'Custom programming' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save (no request)' }));
    await screen.findByText(/Saved "Machine shops"/);
    expect(body(fetchMock, '/profiles/enfav/searches', 'POST')).toEqual({
      name: 'Custom programming',
      filter: { naics: '541511', status: 'active' },
      days: 7,
      includedInPull: false,
      pullOrder: 3,
    });
  });

  it('[GOVU-6] toggles a saved search into the daily pull, reorders it, runs it, loads it for editing, and removes it', async () => {
    const { calls, fetchMock } = stubApi([
      ...baseRoutes(),
      { method: 'PUT', path: /^\/searches\/s-\d$/, body: { data: SAVED_SEARCHES[2] } },
      { method: 'POST', path: '/searches/s-2/run', body: { data: makePullReport() } },
      { method: 'DELETE', path: '/searches/s-1', status: 204 },
    ]);
    mount();
    fireEvent.click(await screen.findByRole('tab', { name: 'SAM.gov (spends requests)' }));
    const table = await screen.findByRole('table', { name: 'Saved searches' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);

    fireEvent.click(screen.getByLabelText('Include Brackets anywhere in the daily pull'));
    await waitFor(() =>
      expect(calls.map((call) => `${call.method} ${call.url}`)).toContain('PUT /searches/s-3'),
    );
    expect(body(fetchMock, '/searches/s-3', 'PUT')).toEqual({
      name: 'Brackets anywhere',
      filter: { title: 'bracket' },
      days: 30,
      includedInPull: true,
      pullOrder: 2,
    });

    fireEvent.change(screen.getByLabelText('Pull order of Machine shops'), {
      target: { value: '9' },
    });
    await waitFor(() =>
      expect(calls.map((call) => `${call.method} ${call.url}`)).toContain('PUT /searches/s-1'),
    );
    expect(body(fetchMock, '/searches/s-1', 'PUT')).toMatchObject({
      name: 'Machine shops',
      pullOrder: 9,
      includedInPull: true,
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Run Custom programming (1 request per page)' }),
    );
    await screen.findByText(/"Custom programming" finished: 3 of 3 attempts/);
    expect(calls.map((call) => `${call.method} ${call.url}`)).toContain('POST /searches/s-2/run');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Custom programming' }));
    expect(screen.getByRole('heading', { name: 'Editing "Custom programming"' })).toBeTruthy();
    expect(
      (screen.getByLabelText('NAICS (exact code, 2–6 digits)') as HTMLInputElement).value,
    ).toBe('541511');
    expect((screen.getByLabelText('Save as') as HTMLInputElement).value).toBe('Custom programming');
    fireEvent.click(screen.getByRole('button', { name: 'Update saved search' }));
    await waitFor(() =>
      expect(calls.map((call) => `${call.method} ${call.url}`)).toContain('PUT /searches/s-2'),
    );
    expect(body(fetchMock, '/searches/s-2', 'PUT')).toEqual({
      name: 'Custom programming',
      filter: { naics: '541511', status: 'active' },
      days: 3,
      includedInPull: true,
      pullOrder: 1,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Machine shops' }));
    await screen.findByText('Removed "Machine shops".');
    expect(calls.map((call) => `${call.method} ${call.url}`)).toContain('DELETE /searches/s-1');
  });

  it('shows a failed write beside the list and keeps the page', async () => {
    stubApi([
      ...baseRoutes(),
      {
        method: 'PUT',
        path: /^\/searches\/s-\d$/,
        status: 409,
        body: { statusCode: 409, message: 'a search named x already exists' },
      },
    ]);
    mount();
    fireEvent.click(await screen.findByRole('tab', { name: 'SAM.gov (spends requests)' }));
    await screen.findByRole('table', { name: 'Saved searches' });
    fireEvent.click(screen.getByLabelText('Include Brackets anywhere in the daily pull'));
    expect((await screen.findByRole('alert')).textContent).toBe('a search named x already exists');
    expect(screen.getByRole('table', { name: 'Saved searches' })).toBeTruthy();
  });
});
