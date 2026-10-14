import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as stories from './incumbents-panel.stories';

const { Unasked, AnyPsc, Found, Capped, NoneHere, Gap, NoPsc, Reading, Failed } =
  composeStories(stories);

describe('IncumbentsPanel', () => {
  it('[GOVU-24] waits to be asked, behind a button that says the read is free, with the notice’s product service code as a narrowing that is on until unticked', () => {
    const onAsk = vi.fn();
    const onSamePscChange = vi.fn();
    const unasked = renderWithTheme(<Unasked onAsk={onAsk} onSamePscChange={onSamePscChange} />);
    expect(screen.queryByRole('table')).toBeNull();
    const narrow = screen.getByLabelText('Only under PSC 5340') as HTMLInputElement;
    expect(narrow.checked).toBe(true);
    fireEvent.click(narrow);
    expect(onSamePscChange).toHaveBeenCalledWith(false);
    fireEvent.click(
      screen.getByRole('button', { name: 'Look for awards ending at this buyer — free' }),
    );
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/every award in the NAICS code is walked/)).toBeNull();
    unasked.unmount();

    // Unticked, the panel says what the wider read costs before it is asked for.
    const wide = renderWithTheme(<AnyPsc />);
    expect(
      screen.getByText(/every award in the NAICS code is walked: many more requests/),
    ).toBeTruthy();
    wide.unmount();

    const none = renderWithTheme(<NoPsc />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    none.unmount();

    const reading = renderWithTheme(<Reading />);
    expect(
      (screen.getByRole('button', { name: 'Reading the awards…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    reading.unmount();

    renderWithTheme(<Failed />);
    expect(screen.getByRole('alert').textContent).toBe('error: status 503');
  });

  it('[GOVU-24] lists the awards at the notice’s own buyer soonest-ending first — each a link to its own record, its holder a link when it has a UEI — says how many the scope listed, and where the answer came from', () => {
    renderWithTheme(<Found />);
    expect(
      screen.getByText(
        '2 of the 3 award(s) the scope lists ending within 24 months of 2026-06-15 are at this buyer.',
      ),
    ).toBeTruthy();
    const rows = within(screen.getByRole('table', { name: 'Awards that may hold this work' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows.map((row) => row.querySelector('td')?.textContent)).toEqual([
      '2026-07-20',
      '2027-03-31',
    ]);
    expect(
      within(rows[0] as HTMLElement)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['N6660426P0205', '/awards/CONT_AWD_N6660426P0205_9700_-NONE-_-NONE-'],
      ['VIRGINIA HIGHLANDS MACHINE INC.', '/primes/DMDXQNBUKXV5'],
    ]);
    // No UEI: the holder is named, and only the award is a link.
    expect(
      within(rows[1] as HTMLElement)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/awards/CONT_IDV_SPE4A723D0042_9700']);
    expect(rows[1]?.textContent).toContain('A HOLDER WITHOUT A UEI');
    expect(rows[1]?.textContent).toContain('IDVs');
    expect(screen.getByText(/usaspending · data as of 2026-06-14/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Read again — free' })).toBeTruthy();
  });

  it('[GOVU-24] says how far a capped list is complete, that none of the listed awards is at this buyer, and which fact a notice lacks when nothing could be read', () => {
    const capped = renderWithTheme(<Capped />);
    expect(screen.getByRole('alert').textContent).toBe(
      'The list is complete only for awards ending before 2026-11-30; later ones may be missing. Narrow it to the product service code to reach further.',
    );
    capped.unmount();

    const none = renderWithTheme(<NoneHere />);
    expect(screen.getByText(/^0 of the 3 award\(s\) the scope lists/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    none.unmount();

    renderWithTheme(<Gap />);
    expect(screen.getByText(/This notice names no NAICS code the award data takes/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/usaspending/)).toBeNull();
  });
});
