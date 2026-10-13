import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { codesOf } from '../codes';
import * as stories from './fetch-awards-form.stories';

const { Default, WithReport, Pending } = composeStories(stories);

describe('FetchAwardsForm', () => {
  it("[GOVU-9] states each source's cost beside its checkbox and asks for the codes, window and sources chosen", () => {
    const onFetch = vi.fn();
    renderWithTheme(<Default onFetch={onFetch} />);
    expect(
      screen.getByLabelText(
        /SAM\.gov Contract Awards — 1 request per page for every code, up to 3 pages each/,
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText(/USAspending — free/)).toBeTruthy();
    expect((screen.getByLabelText('NAICS codes') as HTMLInputElement).value).toBe(
      '332710, 333249, 541511, 541512',
    );
    fireEvent.change(screen.getByLabelText('NAICS codes'), { target: { value: '332710 541511' } });
    fireEvent.change(screen.getByLabelText('PSC codes'), { target: { value: '4920' } });
    fireEvent.change(screen.getByLabelText('Signed from'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Signed to'), { target: { value: '2026-09-29' } });
    fireEvent.click(screen.getByLabelText(/USAspending — free/));
    expect(screen.getByText(/Spends up to 3 SAM\.gov requests \(one per page/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(onFetch).toHaveBeenCalledWith({
      naics: ['332710', '541511'],
      psc: ['4920'],
      from: '2026-01-01',
      to: '2026-09-29',
      sources: ['sam.gov'],
    });
    expect(codesOf(' a,b  c ,')).toEqual(['a', 'b', 'c']);
  });

  it('refuses to fetch with no codes or no source, and rows the report of the last fetch', () => {
    renderWithTheme(<Default />);
    fireEvent.change(screen.getByLabelText('NAICS codes'), { target: { value: '' } });
    expect((screen.getByRole('button', { name: 'Fetch' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    renderWithTheme(<WithReport />);
    const rows = within(screen.getByRole('table', { name: 'Fetch report' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(3);
    expect(
      within(rows[1] as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      'sam.gov',
      '541511',
      'budget-exhausted',
      '0',
      '0',
      '0',
      '0',
      'budget 1000/1000 spent',
    ]);
    expect(within(rows[2] as HTMLElement).getAllByRole('cell')[7]?.textContent).toBe(
      'truncated · more pages beyond 3',
    );
    expect(screen.getByText(/1000 of 1000 SAM\.gov attempts used/)).toBeTruthy();
    renderWithTheme(<Pending />);
    expect((screen.getByRole('button', { name: 'Fetching…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
