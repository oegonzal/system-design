import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './primes-panels.stories';

const {
  Ranking,
  Empty,
  Summary,
  SummaryComplete,
  SummaryHiredBy,
  ReadLine,
  ReadLineComplete,
  Record,
  RecordUnlisted,
} = composeStories(stories);

describe('the primes panels', () => {
  it('[GOVU-17] says how many subcontracts the source holds, how many were read and how far back, how many repeated, and that older ones were left unread — or nothing of that when all were read', () => {
    const capped = renderWithTheme(<Summary />);
    const tiles = screen.getByLabelText('Subcontracts read');
    expect(within(tiles).getByText('16,771')).toBeTruthy();
    expect(within(tiles).getByText('between $50K and $2M')).toBeTruthy();
    expect(within(tiles).getByText('2,906')).toBeTruthy();
    expect(within(tiles).getByText('back to 2025-04-03 · 94 repeat(s) removed')).toBeTruthy();
    expect(within(tiles).getByText('158')).toBeTruthy();
    expect(within(tiles).getByText('1,126')).toBeTruthy();
    expect(
      screen.getByText(/Subcontracts between \$50K and \$2M, dated 2024-10-01 to 2025-09-30\./),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /subcontracts before 2025-04-03 are not counted here, so a prime’s count is a floor/,
      ),
    ).toBeTruthy();
    capped.unmount();

    const whole = renderWithTheme(<SummaryComplete />);
    expect(screen.queryByText(/is a floor/)).toBeNull();
    whole.unmount();

    const hired = renderWithTheme(<SummaryHiredBy />);
    expect(
      screen.getByText(
        /Narrowed to JLW7WAKPEKD4 as the subcontractor: these are the primes that reported paying it\. Subcontracts of any size/,
      ),
    ).toBeTruthy();
    hired.unmount();

    // The same read in one line, where the page is about one firm.
    const line = renderWithTheme(<ReadLine />);
    expect(
      screen.getByText(
        'Counted among the 2,906 most recent of 16,771 subcontracts between $50K and $2M reported in these codes, 2024-10-01 to 2025-09-30: those before 2025-04-03 were not read, so a count here is a floor.',
      ),
    ).toBeTruthy();
    line.unmount();
    renderWithTheme(<ReadLineComplete />);
    expect(
      screen.getByText(
        'Counted among all 403 subcontracts between $50K and $2M reported in these codes, 2024-10-01 to 2025-09-30.',
      ),
    ).toBeTruthy();
  });

  it('[GOVU-17] rows each prime with its UEI, its subcontracts, different firms, dollars, share under service codes and what it holds, links one with a UEI to its page, and lists the firms it reported most as links to who hires them', () => {
    renderWithTheme(<Ranking />);
    const rows = within(screen.getByRole('table', { name: 'Primes' }))
      .getAllByRole('row')
      .slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .slice(0, 6)
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      ['JCBMLGPE6Z71', '320', '157', '$96.4M', '92%', '$3.1B'],
      ['SMNWM6HN79X5', '298', '157', '$91M', '88%', '$3B'],
      ['—', '16', '6', '$2.4M', '50%', '—'],
    ]);
    expect(
      screen.getByRole('link', { name: 'BOOZ ALLEN HAMILTON INC.' }).getAttribute('href'),
    ).toBe('/primes/JCBMLGPE6Z71');
    // No UEI: named, and nothing to link to.
    expect(screen.queryByRole('link', { name: 'A PRIME WITHOUT A UEI' })).toBeNull();
    expect(within(rows[2] as HTMLElement).getByRole('rowheader').textContent).toBe(
      'A PRIME WITHOUT A UEI',
    );
    expect(screen.getByText('The first 3 of 158 primes.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '2 most reported' }));
    const most = screen.getByRole('list', { name: 'Firms BOOZ ALLEN HAMILTON INC. reported most' });
    expect(
      within(most).getByRole('link', { name: 'Who hires TELOS CORPORATION' }).getAttribute('href'),
    ).toBe('/spending?recipient=JLW7WAKPEKD4&tab=primes');
    expect(most.textContent).toContain('A FIRM WITHOUT A UEI');
    expect(within(most).getAllByRole('link')).toHaveLength(1);
  });

  it('[GOVU-17] says when nothing was reported, and opens one firm’s own row out — or says it reported fewer than the last one listed', () => {
    const none = renderWithTheme(<Empty />);
    expect(
      screen.getByText('No subcontract was reported for this scope, window and size.'),
    ).toBeTruthy();
    none.unmount();

    const own = renderWithTheme(<Record />);
    const tiles = screen.getByLabelText('This firm’s subcontracts');
    expect(within(tiles).getByText('320')).toBeTruthy();
    expect(
      within(screen.getByRole('table', { name: 'Firms it reported most' })).getAllByRole('row'),
    ).toHaveLength(3);
    own.unmount();

    renderWithTheme(<RecordUnlisted />);
    expect(
      screen.getByText(
        'This firm is not among the 3 primes that reported the most: among the rows read it reported fewer than 16, or none.',
      ),
    ).toBeTruthy();
  });
});
