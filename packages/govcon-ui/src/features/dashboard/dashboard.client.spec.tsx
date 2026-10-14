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
  OWN_ENTITY,
  PROFILE,
  SOURCE_STATUS,
} from '../../testing/fixtures';
import { PIPELINE_ROWS, TARGETS } from '../../testing/pipeline-fixtures';
import { ALERT_VIEW, REACH } from '../../testing/spending-fixtures';
import { DashboardClient } from './dashboard.client';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

const EARLY = '/leads?profile=enfav&limit=5&noticeTypes=Sources+Sought%2CPresolicitation';

const baseRoutes = (): StubRoute[] => [
  { path: '/profiles', body: { data: [PROFILE] } },
  { path: '/source', body: { data: SOURCE_STATUS } },
  { path: '/leads', body: { data: makeLeadsReport() } },
  { path: '/pipeline', body: { data: PIPELINE_ROWS, meta: { total: 3, limit: 200, offset: 0 } } },
  { path: '/targets', body: { data: TARGETS, meta: { total: 2, limit: 200, offset: 0 } } },
  { path: '/spending/reach', body: { data: REACH } },
  { path: '/entities/own', body: { data: OWN_ENTITY } },
  { path: '/alerts', body: { data: [ALERT_VIEW], meta: { total: 1, limit: 10, offset: 0 } } },
];

const mount = () =>
  renderWithTheme(
    <ProfileProvider>
      <DashboardClient />
    </ProfileProvider>,
  );

beforeEach(() => resetNavigationMock());
afterEach(() => vi.unstubAllGlobals());

describe('DashboardClient', () => {
  it('[GOVU-26] leads with what to act on — what is due, what was raised, the early notices, the best leads — then what was within reach, then the sources and a pull, then the registration, each panel reading its own resource for the active profile', async () => {
    const { calls } = stubApi(baseRoutes());
    mount();
    await screen.findByRole('table', { name: 'Early notices' });
    await screen.findByLabelText('Reach by cut');
    await screen.findByRole('heading', { name: 'ENFAV LLC' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Dashboard');
    expect(
      screen
        .getAllByRole('region')
        .map((region) => region.getAttribute('aria-label'))
        .filter((label) => label !== null && !label.startsWith('Alerts ')),
    ).toEqual([
      'Due this week',
      'Alerts',
      'Early notices',
      'New leads',
      'Within reach',
      'Pull',
      'Registration',
    ]);
    expect(calls.map((call) => call.url)).toEqual(
      expect.arrayContaining([
        EARLY,
        '/leads?profile=enfav&limit=10',
        '/pipeline?profile=enfav&limit=200',
        '/targets?limit=200',
        '/entities/own?profile=enfav',
      ]),
    );
    // The reach query is the warm's own: the profile's codes, its lanes, the last twelve months.
    const reach = new URL(
      `http://x${calls.find((call) => call.url.startsWith('/spending/reach'))?.url ?? ''}`,
    );
    expect(reach.searchParams.get('naics')).toBe(PROFILE.naics.join(','));
    expect(reach.searchParams.get('lanes')).toBe('NONE,SBA,SBP');
    // A firm due by its reminder stands among the tracked notices due.
    const due = within(screen.getByRole('table', { name: 'Due this week' }));
    expect(due.getByRole('link', { name: 'BOOZ ALLEN HAMILTON INC' }).getAttribute('href')).toBe(
      '/primes/JCBMLGPE6Z71',
    );
    expect(
      screen.getByRole('link', { name: 'Every early notice, on Search' }).getAttribute('href'),
    ).toBe('/search?type=Presolicitation&type=Sources+Sought');
  });

  it('[GOVU-1] loads the sources, the leads, the pipeline and the registration for the active profile, then pulls and re-reads', async () => {
    const { calls, fetchMock } = stubApi([
      ...baseRoutes(),
      { method: 'POST', path: '/pulls', body: { data: makePullReport() } },
    ]);
    mount();
    await screen.findByText('sam.gov enabled');
    await screen.findByRole('table', { name: 'Best leads' });
    await screen.findByRole('table', { name: 'Due this week' });
    await screen.findByRole('heading', { name: 'ENFAV LLC' });
    expect(calls.map((call) => call.url)).toEqual(
      expect.arrayContaining([
        '/profiles',
        '/source',
        '/leads?profile=enfav&limit=10',
        '/pipeline?profile=enfav&limit=200',
        '/entities/own?profile=enfav',
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
    await waitFor(() => {
      expect(calls.slice(before).map((call) => call.url)).toEqual(
        expect.arrayContaining([
          '/source',
          '/leads?profile=enfav&limit=10',
          EARLY,
          '/pipeline?profile=enfav&limit=200',
          '/targets?limit=200',
        ]),
      );
    });
    expect(screen.getByText(/Pull finished: 3 of 3 attempts/)).toBeTruthy();
  });

  it('[GOVU-21] lists what the daily warm raised on the first page, a page at a time, each alert leading to the award it names — where a digest’s "and more" lands', async () => {
    const second = { ...ALERT_VIEW, id: 'a-2', raisedAt: '2026-09-20T10:41:00.000Z' };
    const { calls } = stubApi([
      ...baseRoutes().filter((route) => route.path !== '/alerts'),
      {
        path: '/alerts',
        handler: ({ url }) => ({
          body: {
            data: url.searchParams.get('offset') === '10' ? [second] : [ALERT_VIEW],
            meta: { total: 11, limit: 10, offset: Number(url.searchParams.get('offset')) },
          },
        }),
      },
    ]);
    mount();
    const panel = within(await screen.findByRole('region', { name: 'Alerts' }));
    await panel.findByRole('list', { name: 'Alerts' });
    expect(calls.map((call) => call.url)).toContain('/alerts?limit=10&offset=0');
    expect(panel.getByText(/ends 2026-12-26, in 90 day\(s\)/)).toBeTruthy();
    expect(panel.getByRole('link', { name: 'Award' }).getAttribute('href')).toBe(
      `/awards/${ALERT_VIEW.key.subject}`,
    );
    expect(panel.getByText('1–10 of 11')).toBeTruthy();

    fireEvent.click(panel.getByRole('button', { name: 'Next' }));
    await panel.findByText('raised 2026-09-20');
    expect(calls.map((call) => call.url)).toContain('/alerts?limit=10&offset=10');
    expect(panel.getByText('11–11 of 11')).toBeTruthy();
  });

  it('[GOVU-1] shows a failure beside the panel that failed and keeps the rest, and explains a missing registration', async () => {
    stubApi([
      { path: '/profiles', body: { data: [{ ...PROFILE, entityUei: null }] } },
      { path: '/source', body: { data: SOURCE_STATUS } },
      { path: '/leads', status: 500, body: { statusCode: 500, message: 'the store is down' } },
      { path: '/pipeline', body: { data: [], meta: { total: 0, limit: 200, offset: 0 } } },
      { path: '/targets', body: { data: [], meta: { total: 0, limit: 200, offset: 0 } } },
      { path: '/spending/reach', body: { data: REACH } },
      { path: '/entities/own', body: { data: null } },
      { path: '/alerts', body: { data: [], meta: { total: 0, limit: 10, offset: 0 } } },
    ]);
    mount();
    // Both rankings read the store, and each says so beside itself.
    await waitFor(() =>
      expect(
        screen.getAllByRole('alert').filter((alert) => alert.textContent === 'the store is down'),
      ).toHaveLength(2),
    );
    await screen.findByText(/Nothing raised yet/);
    await screen.findByText(/Nothing due inside 7 days/);
    await screen.findByText(/Set the company UEI on the profile/);
    expect(screen.getByText('sam.gov enabled')).toBeTruthy();
  });
});
