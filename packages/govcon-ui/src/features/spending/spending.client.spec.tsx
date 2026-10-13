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
import { PROFILE } from '../../testing/fixtures';
import {
  AGENCIES,
  AGENCY_OUTLOOK,
  BREAKDOWN,
  HORIZON,
  PULSE,
  SPENDING_NOW_MS,
} from '../../testing/spending-fixtures';
import { SpendingClient } from './spending.client';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

const routes = (): StubRoute[] => [
  { path: '/profiles', body: { data: [PROFILE] } },
  { path: '/spending/agencies', body: { data: AGENCIES } },
  { path: '/spending/pulse', body: { data: PULSE } },
  { path: '/spending/breakdown', body: { data: BREAKDOWN } },
  { path: '/spending/horizon', body: { data: HORIZON } },
  { path: '/spending/agencies/097', body: { data: AGENCY_OUTLOOK } },
];

const mount = () =>
  renderWithTheme(
    <ProfileProvider>
      <SpendingClient />
    </ProfileProvider>,
  );

beforeEach(() => {
  resetNavigationMock();
  vi.spyOn(Date, 'now').mockReturnValue(SPENDING_NOW_MS);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const urls = (calls: { url: string }[]) => calls.map((call) => call.url);

describe('SpendingClient', () => {
  it('[GOVU-11] reads the directory and the pulse at once, re-reads the pulse as the scope changes, and opens each other lens only when its tab is visited', async () => {
    const { calls } = stubApi(routes());
    mount();
    await screen.findByRole('img', { name: 'Obligations by fiscal period' });
    expect(urls(calls)).toEqual(
      expect.arrayContaining(['/spending/agencies', '/spending/pulse?awardFamily=both&lookback=3']),
    );
    expect(urls(calls).some((url) => url.startsWith('/spending/breakdown'))).toBe(false);
    expect(screen.getByText(/from the day’s snapshot/)).toBeTruthy();
    expect(
      screen.getByText('Department of Defense awards are published 90 days after they are signed.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '332710' }));
    await waitFor(() => {
      expect(urls(calls)).toContain('/spending/pulse?naics=332710&awardFamily=both&lookback=3');
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Where' }));
    await screen.findByRole('list', { name: 'Obligations by awarding agency' });
    expect(urls(calls)).toContain(
      '/spending/breakdown?naics=332710&awardFamily=both&category=awarding_agency&from=2025-10-01&to=2026-06-15',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Prior fiscal year' }));
    await waitFor(() => {
      expect(urls(calls)).toContain(
        '/spending/breakdown?naics=332710&awardFamily=both&category=awarding_agency&from=2024-10-01&to=2025-09-30',
      );
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Horizon' }));
    await screen.findByRole('img', { name: 'Expiring awards by month' });
    expect(urls(calls)).toContain('/spending/horizon?naics=332710&awardFamily=both&months=12');
    expect(screen.getByRole('table', { name: 'Expiring awards' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Months ahead'), { target: { value: '24' } });
    await waitFor(() => {
      expect(urls(calls)).toContain('/spending/horizon?naics=332710&awardFamily=both&months=24');
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Agency' }));
    const directory = await screen.findByRole('table', { name: 'Agencies' });
    expect(urls(calls).filter((url) => url === '/spending/agencies')).toHaveLength(1);
    fireEvent.click(within(directory).getAllByRole('button', { name: 'View' })[0] as HTMLElement);
    await screen.findByRole('img', { name: 'Obligations to date by period' });
    expect(urls(calls)).toContain('/spending/agencies/097?awardFamily=both');
    expect(screen.getByRole('table', { name: 'Sub-agencies' })).toBeTruthy();

    const before = calls.length;
    fireEvent.click(screen.getByRole('tab', { name: 'Pulse' }));
    expect(screen.getByRole('tab', { name: 'Pulse' }).getAttribute('aria-selected')).toBe('true');
    expect(calls.length).toBe(before);
  });

  it('shows a failed lens as an alert and keeps the scope bar and the other panels', async () => {
    stubApi([
      ...routes().filter((route) => route.path !== '/spending/pulse'),
      {
        path: '/spending/pulse',
        status: 502,
        body: { statusCode: 502, message: 'error: status 503' },
      },
    ]);
    mount();
    expect((await screen.findByRole('alert')).textContent).toBe('error: status 503');
    expect(screen.getByLabelText('NAICS codes')).toBeTruthy();
    await screen.findByRole('option', { name: 'DOD — Department of Defense' });
  });
});
