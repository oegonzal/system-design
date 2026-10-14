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
import { ENTITY, PROFILE } from '../../testing/fixtures';
import { BREAKDOWN, HORIZON, PRIMES, SPENDING_NOW_MS } from '../../testing/spending-fixtures';
import { PrimeClient } from './prime.client';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

const UEI = 'JCBMLGPE6Z71';
const NAICS = encodeURIComponent(PROFILE.naics.join(','));

/** The recipients of a scope narrowed to one firm: that firm alone, and its total. */
const HELD = {
  ...BREAKDOWN,
  category: 'recipient',
  total: 2_512_000_000,
  rows: [{ id: null, code: UEI, name: 'BOOZ ALLEN HAMILTON INC', amount: 2_512_000_000, share: 1 }],
};

const routes = (entity: unknown = null): StubRoute[] => [
  { path: '/profiles', body: { data: [PROFILE] } },
  { path: `/entities/${UEI}`, body: { data: entity } },
  { path: '/spending/horizon', body: { data: HORIZON } },
  {
    path: '/spending/breakdown',
    handler: ({ url }) => ({
      body: { data: url.searchParams.get('category') === 'recipient' ? HELD : BREAKDOWN },
    }),
  },
  { path: '/spending/primes', body: { data: PRIMES } },
];

const mount = (uei = UEI) =>
  renderWithTheme(
    <ProfileProvider>
      <PrimeClient uei={uei} />
    </ProfileProvider>,
  );
const urls = (calls: { url: string }[]) => calls.map((call) => call.url);

beforeEach(() => {
  resetNavigationMock();
  vi.spyOn(Date, 'now').mockReturnValue(SPENDING_NOW_MS);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PrimeClient', () => {
  it('[GOVU-19] names the firm and says what it holds from the recipient ranking narrowed to it, reads its stored registration and the awards it holds that are ending, in the profile’s codes, and reads each other panel only once its tab is opened', async () => {
    const { calls } = stubApi(routes());
    mount();
    await screen.findByRole('table', { name: 'Expiring awards' });
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('BOOZ ALLEN HAMILTON INC'),
    );
    expect(
      screen.getByText(
        `UEI ${UEI} · $2.5B obligated to it in these codes, 2025-06-15 to 2026-06-15`,
      ),
    ).toBeTruthy();
    const holdings = `/spending/breakdown?naics=${NAICS}&awardFamily=both&category=recipient&from=2025-06-15&to=2026-06-15&recipient=${UEI}`;
    expect(urls(calls)).toEqual(
      expect.arrayContaining([
        `/entities/${UEI}`,
        holdings,
        `/spending/horizon?naics=${NAICS}&awardFamily=both&months=12&recipient=${UEI}`,
      ]),
    );
    expect(urls(calls).filter((url) => url.startsWith('/spending/breakdown'))).toEqual([holdings]);
    expect(urls(calls).some((url) => url.startsWith('/spending/primes'))).toBe(false);
    expect(
      screen
        .getByRole('link', { name: 'Open the Spending page narrowed to it' })
        .getAttribute('href'),
    ).toBe(`/spending?recipient=${UEI}`);

    // Who buys from it: the breakdown, by sub-agency, narrowed to the firm.
    fireEvent.click(screen.getByRole('tab', { name: 'Who buys from it' }));
    await screen.findByRole('list', { name: /^Obligations by/ });
    expect(urls(calls)).toContain(
      `/spending/breakdown?naics=${NAICS}&awardFamily=both&category=awarding_subagency&from=2025-06-15&to=2026-06-15&recipient=${UEI}`,
    );

    // Who it hires: its own row of the profile's ranking, at the profile's size of subcontract,
    // and how far the read reached in one line — never the scope's own tiles.
    fireEvent.click(screen.getByRole('tab', { name: 'Who it hires' }));
    await screen.findByRole('table', { name: 'Firms it reported most' });
    const hires = within(screen.getByRole('region', { name: 'Who it hires' }));
    expect(
      hires.getByText(/^Counted among the 2,906 most recent of 16,771 subcontracts/),
    ).toBeTruthy();
    expect(hires.queryByLabelText('Subcontracts read')).toBeNull();
    const ranking = `/spending/primes?naics=${NAICS}&awardFamily=contracts&from=2025-06-15&to=2026-06-15&band=50000-2000000`;
    expect(urls(calls)).toContain(ranking);

    // Who hires it: the same lens, the firm as the subcontractor.
    fireEvent.click(screen.getByRole('tab', { name: 'Who hires it' }));
    await waitFor(() => {
      expect(urls(calls)).toContain(
        `/spending/primes?naics=${NAICS}&awardFamily=contracts&from=2025-06-15&to=2026-06-15&recipient=${UEI}&band=50000-2000000`,
      );
    });
    await screen.findByRole('table', { name: 'Primes' });
  });

  it('[GOVU-19] looks the registration up behind a button that states its cost, stores it, and says when SAM.gov knows no such firm', async () => {
    let stored: unknown = null;
    let known = false;
    const { fetchMock } = stubApi([
      ...routes().filter((route) => route.path !== `/entities/${UEI}`),
      { path: `/entities/${UEI}`, handler: () => ({ body: { data: stored } }) },
      {
        method: 'POST',
        path: '/entities/lookup',
        handler: () => {
          if (known) {
            stored = { ...ENTITY, uei: UEI, legalName: 'BOOZ ALLEN HAMILTON, INCORPORATED' };
          }
          return {
            body: {
              data: {
                entities: known ? [stored] : [],
                unknown: known ? [] : [UEI],
                spent: 1,
                budget: 8,
              },
            },
          };
        },
      },
    ]);
    mount();
    const registration = within(await screen.findByRole('region', { name: 'Registration' }));
    await registration.findByText(/No registration is stored/);
    fireEvent.click(registration.getByRole('button', { name: /^Look up — 1 request/ }));
    expect((await registration.findByRole('alert')).textContent).toBe(
      `SAM.gov knows no registrant ${UEI}.`,
    );

    known = true;
    fireEvent.click(registration.getByRole('button', { name: /^Look up — 1 request/ }));
    expect((await registration.findByRole('heading', { level: 2 })).textContent).toBe(
      'BOOZ ALLEN HAMILTON, INCORPORATED',
    );
    // The registration's own name heads the page once it is stored.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'BOOZ ALLEN HAMILTON, INCORPORATED',
    );
    const posts = fetchMock.mock.calls.filter((call) => (call[1] as RequestInit).method === 'POST');
    expect(JSON.parse(String((posts[0]?.[1] as RequestInit).body))).toEqual({ ueis: [UEI] });
    expect(registration.queryByRole('alert')).toBeNull();
  });

  it('[GOVU-19] makes a value that is not a UEI a dead end and reads nothing for it', async () => {
    const { calls } = stubApi(routes());
    mount('not-a-uei');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Not a UEI');
    expect(
      urls(calls).some((url) => url.startsWith('/spending') || url.startsWith('/entities')),
    ).toBe(false);
  });
});
