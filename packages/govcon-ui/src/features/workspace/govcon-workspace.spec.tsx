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

import {
  CALLS,
  DESCRIPTION,
  LEADS,
  makeLeadDetail,
  makeLeadsReport,
  makePullReport,
  PROFILE,
  SOURCE_STATUS,
} from '../../testing/fixtures';
import { GovconWorkspace } from './govcon-workspace';

// `importActual` rather than `import()`: the factory is hoisted above the
// static imports, and a dynamic import would make Nx read the harness as a
// lazy-loaded library and reject the static imports above.
vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

const NOTICE = LEADS[0]?.opportunity.noticeId ?? '';

const baseRoutes = (): StubRoute[] => [
  { path: '/profiles', body: { data: [PROFILE] } },
  { path: '/source', body: { data: SOURCE_STATUS } },
  { path: '/source/calls', body: { data: CALLS, meta: { total: 3, limit: 20, offset: 0 } } },
  { path: '/leads', body: { data: makeLeadsReport() } },
];

beforeEach(() => {
  resetNavigationMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GovconWorkspace', () => {
  it('[GOVU-1] loads the source, the profiles, the leads and the ledger, then pulls and re-reads the store', async () => {
    const { calls, fetchMock } = stubApi([
      ...baseRoutes(),
      { method: 'POST', path: '/pulls', body: { data: makePullReport() } },
    ]);
    renderWithTheme(<GovconWorkspace />);

    await screen.findByText('sam.gov enabled');
    await screen.findByRole('option', { name: 'Enfav LLC (enfav)' });
    await screen.findByRole('table', { name: 'Leads' });
    await screen.findByRole('table', { name: 'Source calls' });
    expect(calls.map((call) => call.url)).toEqual(
      expect.arrayContaining([
        '/profiles',
        '/source',
        '/source/calls?limit=20',
        '/leads?profile=enfav&minScore=0&limit=25',
      ]),
    );
    const before = calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Pull' }));
    await screen.findByRole('heading', { name: 'Pull · enfav · posted 2026-09-24 to 2026-09-26' });
    const pull = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/pulls'));
    expect(JSON.parse(String((pull?.[1] as RequestInit).body))).toEqual({
      profile: 'enfav',
      days: 3,
    });

    // The store changed: the source, the leads and the ledger are read again.
    await waitFor(() => {
      const after = calls.slice(before).map((call) => call.url);
      expect(after).toEqual(
        expect.arrayContaining([
          '/source',
          '/source/calls?limit=20',
          '/leads?profile=enfav&minScore=0&limit=25',
        ]),
      );
    });
    expect(screen.getByText(/Pull finished: 3 of 3 attempts/)).toBeTruthy();
  });

  it('[GOVU-2] re-queries the leads when a filter changes, opens a lead on click and writes it to the URL', async () => {
    const { calls } = stubApi([
      ...baseRoutes(),
      { path: new RegExp(`^/notices/${NOTICE}$`), body: { data: makeLeadDetail() } },
    ]);
    renderWithTheme(<GovconWorkspace />);
    await screen.findByRole('table', { name: 'Leads' });

    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'high' } });
    await waitFor(() => {
      expect(calls.map((call) => call.url)).toContain(
        '/leads?profile=enfav&minScore=0&tier=high&limit=25',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /JUNCTION BOX/ }));
    const lead = await screen.findByRole('region', { name: 'Lead' });
    await within(lead).findByRole('table', { name: 'Factor trace' });
    expect(calls.map((call) => call.url)).toContain(`/notices/${NOTICE}?profile=enfav`);
    expect(routerMock.replace).toHaveBeenCalledWith(`?notice=${NOTICE}`);
    expect(screen.getByRole('button', { name: /JUNCTION BOX/ }).getAttribute('aria-current')).toBe(
      'true',
    );
  });

  it('[GOVU-2] opens the lead named by ?notice= on arrival, without rewriting the URL', async () => {
    setMockSearchParams({ notice: NOTICE });
    const { calls } = stubApi([
      ...baseRoutes(),
      { path: new RegExp(`^/notices/${NOTICE}$`), body: { data: makeLeadDetail() } },
    ]);
    renderWithTheme(<GovconWorkspace />);
    const lead = await screen.findByRole('region', { name: 'Lead' });
    await within(lead).findByRole('heading', {
      name: '59--JUNCTION BOX, IN REPAIR/MODIFICATION OF',
    });
    expect(calls.map((call) => call.url)).toContain(`/notices/${NOTICE}?profile=enfav`);
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('[GOVU-3] fetches a description on demand and shows the stored text after re-reading the notice', async () => {
    setMockSearchParams({ notice: NOTICE });
    const { calls } = stubApi([
      ...baseRoutes(),
      {
        path: new RegExp(`^/notices/${NOTICE}$`),
        sequence: [
          { data: makeLeadDetail() },
          { data: makeLeadDetail({ description: DESCRIPTION }) },
        ],
      },
      {
        method: 'POST',
        path: new RegExp(`^/notices/${NOTICE}/description$`),
        body: { data: { status: 'ok', description: DESCRIPTION } },
      },
    ]);
    renderWithTheme(<GovconWorkspace />);
    const button = await screen.findByRole('button', { name: 'Fetch description' });
    fireEvent.click(button);
    const text = await screen.findByLabelText('Description text');
    expect(text.textContent).toContain('Delivery: 90 days ARO');
    expect(calls.filter((call) => call.method === 'POST').map((call) => call.url)).toEqual([
      `/notices/${NOTICE}/description`,
    ]);
    expect(screen.getByText('Description fetched and stored.')).toBeTruthy();
  });

  it('[GOVU-3] says when the budget refused the description, beside that notice', async () => {
    setMockSearchParams({ notice: NOTICE });
    stubApi([
      ...baseRoutes(),
      { path: new RegExp(`^/notices/${NOTICE}$`), body: { data: makeLeadDetail() } },
      {
        method: 'POST',
        path: new RegExp(`^/notices/${NOTICE}/description$`),
        body: { data: { status: 'budget-exhausted', spent: 10, budget: 10 } },
      },
    ]);
    renderWithTheme(<GovconWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fetch description' }));
    await screen.findByText('The budget is spent: 10 of 10 requests used in the last 24 h.');
    expect(screen.getByRole('button', { name: 'Fetch description' })).toBeTruthy();
  });

  it('shows the service error where the data would be, and keeps the rest of the page', async () => {
    stubApi([
      { path: '/profiles', body: { data: [PROFILE] } },
      { path: '/source', body: { data: SOURCE_STATUS } },
      { path: '/source/calls', body: { data: [], meta: { total: 0, limit: 20, offset: 0 } } },
      { path: '/leads', status: 500, body: { statusCode: 500, message: 'the store is down' } },
    ]);
    renderWithTheme(<GovconWorkspace />);
    await screen.findByText('the store is down');
    expect(await screen.findByText(/No calls yet/)).toBeTruthy();
    expect(screen.getByText('sam.gov enabled')).toBeTruthy();
  });
});
