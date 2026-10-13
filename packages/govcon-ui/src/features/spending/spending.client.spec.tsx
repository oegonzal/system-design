import type * as WebTesting from '@sysdesign/web-testing';
import {
  renderWithTheme,
  resetNavigationMock,
  routerMock,
  setMockPathname,
  setMockSearchParams,
  stubApi,
  type StubRoute,
} from '@sysdesign/web-testing';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
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

/** A fresh element each time: React skips a root rendered the same element object again, and the mocked address is not React state. */
const ui = () => (
  <ProfileProvider>
    <SpendingClient />
  </ProfileProvider>
);
const mount = () => renderWithTheme(ui());
const urls = (calls: { url: string }[]) => calls.map((call) => call.url);
/** The code list as the API client spells it on the wire. */
const naicsOf = (codes: readonly string[]) => encodeURIComponent(codes.join(','));
/** The address the page last replaced to. */
const lastReplace = (): string => String(routerMock.replace.mock.calls.at(-1)?.[0]);
/** Play the router: the page's last replace becomes the address it reads. */
async function applyLastReplace(rerender: (next: ReactElement) => void): Promise<void> {
  const url = new URL(lastReplace(), 'http://localhost');
  expect(url.pathname).toBe('/spending');
  setMockSearchParams(url.searchParams);
  await act(async () => rerender(ui()));
}

beforeEach(() => {
  resetNavigationMock();
  setMockPathname('/spending');
  vi.spyOn(Date, 'now').mockReturnValue(SPENDING_NOW_MS);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SpendingClient', () => {
  it('[GOVU-11] [GOVU-12] opens on the profile’s NAICS and reads the directory and the pulse once, writes every change to the address and re-reads from it, opens each other lens only when its tab is visited, and narrows every lens to a picked agency', async () => {
    const { calls } = stubApi(routes());
    const { rerender } = mount();
    await screen.findByRole('img', { name: 'Obligations by fiscal period' });
    expect(urls(calls)).toEqual(
      expect.arrayContaining([
        '/spending/agencies',
        `/spending/pulse?naics=${naicsOf(PROFILE.naics)}&awardFamily=both&lookback=3`,
      ]),
    );
    expect(urls(calls).filter((url) => url.startsWith('/spending/pulse'))).toHaveLength(1);
    expect(urls(calls).some((url) => url.startsWith('/spending/breakdown'))).toBe(false);
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(screen.getByText(/from the day’s snapshot/)).toBeTruthy();
    expect(
      screen.getByText('Department of Defense awards are published 90 days after they are signed.'),
    ).toBeTruthy();

    // A chip off: the address names the codes left, and the pulse re-reads them.
    fireEvent.click(screen.getByRole('button', { name: '332710' }));
    const rest = PROFILE.naics.filter((code) => code !== '332710');
    const restParams = rest.map((code) => `naics=${code}`).join('&');
    expect(lastReplace()).toBe(`/spending?${restParams}`);
    await applyLastReplace(rerender);
    const narrowed = `naics=${naicsOf(rest)}&awardFamily=both`;
    await waitFor(() => {
      expect(urls(calls)).toContain(`/spending/pulse?${narrowed}&lookback=3`);
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Where' }));
    expect(lastReplace()).toBe(`/spending?${restParams}&tab=where`);
    await applyLastReplace(rerender);
    await screen.findByRole('list', { name: 'Obligations by awarding agency' });
    expect(urls(calls)).toContain(
      `/spending/breakdown?${narrowed}&category=awarding_agency&from=2025-06-15&to=2026-06-15`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Prior fiscal year' }));
    expect(lastReplace()).toBe(`/spending?${restParams}&tab=where&window=prior-fy`);
    await applyLastReplace(rerender);
    await waitFor(() => {
      expect(urls(calls)).toContain(
        `/spending/breakdown?${narrowed}&category=awarding_agency&from=2024-10-01&to=2025-09-30`,
      );
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Horizon' }));
    await applyLastReplace(rerender);
    await screen.findByRole('img', { name: 'Expiring awards by month' });
    expect(urls(calls)).toContain(`/spending/horizon?${narrowed}&months=12`);
    expect(screen.getByRole('table', { name: 'Expiring awards' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Months ahead'), { target: { value: '24' } });
    expect(lastReplace()).toBe(`/spending?${restParams}&tab=horizon&window=prior-fy&months=24`);
    await applyLastReplace(rerender);
    await waitFor(() => {
      expect(urls(calls)).toContain(`/spending/horizon?${narrowed}&months=24`);
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Agency' }));
    await applyLastReplace(rerender);
    const directory = await screen.findByRole('table', { name: 'Agencies' });
    expect(urls(calls).filter((url) => url === '/spending/agencies')).toHaveLength(1);
    fireEvent.click(within(directory).getAllByRole('button', { name: 'View' })[0] as HTMLElement);
    expect(lastReplace()).toBe(
      `/spending?${restParams}&agency=097&tab=agency&window=prior-fy&months=24`,
    );
    await applyLastReplace(rerender);
    await screen.findByRole('img', { name: 'Obligations to date by period' });
    expect(urls(calls)).toContain('/spending/agencies/097?awardFamily=both');
    expect(screen.getByRole('table', { name: 'Sub-agencies' })).toBeTruthy();
    expect(
      within(directory).getByRole('button', { name: 'In scope' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect((screen.getByRole('combobox', { name: 'Agency' }) as HTMLSelectElement).value).toBe(
      '097',
    );
    // Every mounted lens follows the narrowed scope.
    const scoped = `naics=${naicsOf(rest)}&agency=097&awardFamily=both`;
    await waitFor(() => {
      expect(urls(calls)).toContain(`/spending/pulse?${scoped}&lookback=3`);
      expect(urls(calls)).toContain(`/spending/horizon?${scoped}&months=24`);
    });

    const before = calls.length;
    fireEvent.click(screen.getByRole('tab', { name: 'Pulse' }));
    expect(lastReplace()).toBe(`/spending?${restParams}&agency=097&window=prior-fy&months=24`);
    await applyLastReplace(rerender);
    expect(screen.getByRole('tab', { name: 'Pulse' }).getAttribute('aria-selected')).toBe('true');
    expect(calls.length).toBe(before);
  });

  it('[GOVU-12] reproduces a view from its address, mounting only the lens it names, and falls back from values it does not know', async () => {
    const { calls } = stubApi(routes());
    setMockSearchParams(
      'naics=332710&agency=097&tab=horizon&months=24&window=nonsense&awardFamily=all',
    );
    mount();
    await screen.findByRole('img', { name: 'Expiring awards by month' });
    expect(urls(calls)).toContain(
      '/spending/horizon?naics=332710&agency=097&awardFamily=both&months=24',
    );
    expect(urls(calls).some((url) => url.startsWith('/spending/pulse'))).toBe(false);
    expect(screen.getByRole('tab', { name: 'Horizon' }).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByLabelText('Months ahead') as HTMLSelectElement).value).toBe('24');
    expect((screen.getByLabelText('NAICS codes') as HTMLInputElement).value).toBe('332710');
    await waitFor(() => {
      expect((screen.getByRole('combobox', { name: 'Agency' }) as HTMLSelectElement).value).toBe(
        '097',
      );
    });
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('[GOVU-12] writes typed codes to the address once typing pauses', async () => {
    stubApi(routes());
    mount();
    await screen.findByRole('img', { name: 'Obligations by fiscal period' });
    fireEvent.change(screen.getByLabelText('PSC codes'), { target: { value: '5340' } });
    expect((screen.getByLabelText('PSC codes') as HTMLInputElement).value).toBe('5340');
    expect(routerMock.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(lastReplace()).toBe('/spending?psc=5340'));
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
