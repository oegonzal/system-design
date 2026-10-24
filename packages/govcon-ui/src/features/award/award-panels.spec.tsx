import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './award-panels.stories';

const {
  Facts,
  FactsStandalone,
  FactsVehicle,
  Header,
  Money,
  MoneyNoOptions,
  MoneySchedule,
  MoneyVehicle,
  Subcontracts,
  NoSubcontracts,
  Notices,
  NoNotices,
} = composeStories(stories);

/** The value beside a fact's name in the facts table. */
const factOf = (name: string): string =>
  within(screen.getByRole('table', { name: 'Award facts' }))
    .getByRole('rowheader', { name })
    .closest('tr')
    ?.querySelector('td')?.textContent ?? '';

describe('the award panels', () => {
  it('[GOVU-18] names the award, its kind, its holder and the holder’s owner as links to their pages, and the buyer down to the office', () => {
    renderWithTheme(<Header />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('89303019FET000003');
    expect(screen.getByText('Contracts')).toBeTruthy();
    expect(screen.getByText('BPA CALL')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'BOOZ ALLEN HAMILTON INC' }).getAttribute('href')).toBe(
      '/primes/JCBMLGPE6Z71',
    );
    expect(
      screen
        .getByRole('link', { name: 'BOOZ ALLEN HAMILTON HOLDING CORPORATION' })
        .getAttribute('href'),
    ).toBe('/primes/MBPHTU7Y9S65');
    expect(
      screen.getByText(
        'Department of Energy › Department of Energy › HEADQUARTERS PROCUREMENT SERVICES',
      ),
    ).toBeTruthy();
  });

  it('[GOVU-18] sets what is obligated against what the award can reach, and its end beside its end with every option, saying when options remain and when none is left', () => {
    const extended = renderWithTheme(<Money />);
    const tiles = within(screen.getByLabelText('Money and dates'));
    expect(tiles.getByText('$44.1M')).toBeTruthy();
    expect(tiles.getByText('96% of $46.1M with every option')).toBeTruthy();
    expect(tiles.getByText('2026-12-26')).toBeTruthy();
    expect(tiles.getByText('194 day(s)')).toBeTruthy();
    expect(tiles.getByText('2027-12-26')).toBeTruthy();
    expect(tiles.getByText('559 day(s) — options remain')).toBeTruthy();
    expect(tiles.getByText('7 reported')).toBeTruthy();
    extended.unmount();

    const spent = renderWithTheme(<MoneyNoOptions />);
    expect(screen.getByText('the same day: no option is left')).toBeTruthy();
    expect(screen.getByText('no ceiling given')).toBeTruthy();
    spent.unmount();

    // A vehicle carries its money on its orders: it is read by them, never by its own obligations.
    const vehicle = renderWithTheme(<MoneyVehicle />);
    const used = within(screen.getByLabelText('Money and dates'));
    expect(used.getByText('Ordered under it')).toBeTruthy();
    expect(used.getByText('$47.6M')).toBeTruthy();
    expect(used.getByText('9 order(s) · 2% of $2.6B ceiling')).toBeTruthy();
    expect(used.queryByText('Obligated')).toBeNull();
    expect(used.getByText('the source gives none')).toBeTruthy();
    vehicle.unmount();

    renderWithTheme(<MoneySchedule />);
    expect(
      screen.getByText('1,204 order(s) · 37 vehicle(s) awarded under it · no ceiling given'),
    ).toBeTruthy();
  });

  it('[GOVU-18] says how the award was bought — the vehicle as a link to its own record, the offers or that none were counted, the set-aside, the subcontracting plan or that none is stated, competition, pricing and codes', () => {
    const order = renderWithTheme(<Facts />);
    expect(screen.getByRole('link', { name: '89303019AET000001' }).getAttribute('href')).toBe(
      '/awards/CONT_IDV_89303019AET000001_8900',
    );
    expect(factOf('Vehicle')).toBe('89303019AET000001 · BPA · SINGLE AWARD · Department of Energy');
    expect(factOf('Offers received')).toBe('3');
    expect(factOf('Set-aside')).toBe('NO SET ASIDE USED.');
    expect(factOf('Subcontracting plan')).toBe('F INDIVIDUAL SUBCONTRACT PLAN');
    expect(factOf('Competition')).toBe('FULL AND OPEN COMPETITION');
    expect(factOf('Pricing')).toBe('TIME AND MATERIALS');
    expect(factOf('NAICS')).toBe('541511 CUSTOM COMPUTER PROGRAMMING SERVICES');
    expect(factOf('Place of performance')).toBe('WASHINGTON, DC');
    order.unmount();

    const alone = renderWithTheme(<FactsStandalone />);
    expect(factOf('Vehicle')).toBe('None: a contract of its own');
    expect(factOf('Offers received')).toBe('Not counted');
    // The code stands in when the source gave no description.
    expect(factOf('Set-aside')).toBe('SBA');
    expect(factOf('Subcontracting plan')).toBe('None stated');
    // Only a vehicle is held by one firm or several.
    expect(screen.queryByRole('rowheader', { name: 'Held by' })).toBeNull();
    alone.unmount();

    renderWithTheme(<FactsVehicle />);
    expect(factOf('Vehicle')).toBe('None: it is a vehicle itself');
    expect(factOf('Held by')).toBe('MULTIPLE AWARD');
  });

  it('[GOVU-18] lists the largest subcontracts under the award and the open notices from the same buyer and code, and says when there are none', () => {
    const roster = renderWithTheme(<Subcontracts />);
    expect(screen.getByText('The 2 largest of 7 reported, $31M in all.')).toBeTruthy();
    const rows = within(screen.getByRole('table', { name: 'Subcontracts under this award' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      'CLEARFOCUS TECHNOLOGIES LLC$15,300,0002020-02-25CYBERSECURITY SERVICES',
      'KFORCE INC.$6,000,0002023-04-21COMMERCIAL STAFFING SERVICES.',
    ]);
    roster.unmount();

    const none = renderWithTheme(<NoSubcontracts />);
    expect(screen.getByText(/No subcontract is reported under this award/)).toBeTruthy();
    none.unmount();

    const open = renderWithTheme(<Notices />);
    const link = within(screen.getByRole('list', { name: 'Open notices' })).getByRole('link');
    expect(link.getAttribute('href')).toBe('/notices/n-1');
    open.unmount();

    renderWithTheme(<NoNotices />);
    expect(screen.getByText(/None stored\./)).toBeTruthy();
  });
});
