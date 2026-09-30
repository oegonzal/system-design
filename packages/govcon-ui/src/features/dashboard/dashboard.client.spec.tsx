import type * as WebTesting from '@sysdesign/web-testing';
import {
  renderWithTheme,
  resetNavigationMock,
  stubApi,
  type StubRoute,
} from '@sysdesign/web-testing';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileProvider } from '../../providers/profile-context';
import {
  makeLeadsReport,
  makePullReport,
  OWN_ENTITY,
  PIPELINE_ROWS,
  PROFILE,
  SOURCE_STATUS,
} from '../../testing/fixtures';
import { DashboardClient } from './dashboard.client';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

const baseRoutes = (): StubRoute[] => [
  { path: '/profiles', body: { data: [PROFILE] } },
  { path: '/source', body: { data: SOURCE_STATUS } },
  { path: '/leads', body: { data: makeLeadsReport() } },
  { path: '/pipeline', body: { data: PIPELINE_ROWS, meta: { total: 3, limit: 50, offset: 0 } } },
  { path: '/entities/own', body: { data: OWN_ENTITY } },
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
        '/pipeline?profile=enfav&limit=50',
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
          '/pipeline?profile=enfav&limit=50',
        ]),
      );
    });
    expect(screen.getByText(/Pull finished: 3 of 3 attempts/)).toBeTruthy();
  });

  it('[GOVU-1] shows a failure beside the panel that failed and keeps the rest, and explains a missing registration', async () => {
    stubApi([
      { path: '/profiles', body: { data: [{ ...PROFILE, entityUei: null }] } },
      { path: '/source', body: { data: SOURCE_STATUS } },
      { path: '/leads', status: 500, body: { statusCode: 500, message: 'the store is down' } },
      { path: '/pipeline', body: { data: [], meta: { total: 0, limit: 50, offset: 0 } } },
      { path: '/entities/own', body: { data: null } },
    ]);
    mount();
    expect((await screen.findByRole('alert')).textContent).toBe('the store is down');
    await screen.findByText(/Nothing due inside 7 days/);
    await screen.findByText(/Set the company UEI on the profile/);
    expect(screen.getByText('sam.gov enabled')).toBeTruthy();
  });
});
