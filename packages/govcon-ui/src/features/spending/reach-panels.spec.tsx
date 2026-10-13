import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as stories from './reach-panels.stories';

const { Funnel, RuledOut, EveryLaneDelayed } = composeStories(stories);

describe('the reach panels', () => {
  it('[GOVU-15] rows each cut with its count, its share of the first, its dollars and a link that ranks who won it, names the lanes counted, and cuts the last by award size against the thresholds', () => {
    renderWithTheme(<Funnel />);
    const rows = within(screen.getByRole('table', { name: 'Reach' }))
      .getAllByRole('row')
      .slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .slice(0, 3)
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      ['4,800', '100%', '$96M'],
      ['3,100', '64.6%', '$52M'],
      ['620', '12.9%', '$21M'],
      ['410', '8.5%', '$9.5M'],
    ]);
    expect(within(rows[0] as HTMLElement).getByRole('rowheader').textContent).toContain(
      'New contracts',
    );
    expect(
      screen.getByRole('link', { name: 'Who won: No vehicle needed' }).getAttribute('href'),
    ).toBe('/spending?tab=where&category=recipient&cut=standalone');
    expect(screen.getByText('Lanes counted: NONE, SBA, SBP.')).toBeTruthy();
    expect(screen.getByText(/New contracts from 2025-06-16 to 2026-06-15/)).toBeTruthy();

    const bands = within(
      screen.getByRole('list', { name: 'Won by a small business by award size' }),
    ).getAllByRole('listitem');
    expect(bands).toHaveLength(4);
    expect((bands[1] as HTMLElement).textContent).toContain('$15K to $350K');
    expect((bands[1] as HTMLElement).textContent).toContain('205');
    expect((bands[1] as HTMLElement).textContent).toContain('50.0%');
    expect((bands[1] as HTMLElement).textContent).toContain('reserved for small business');
    expect(screen.queryByText(/still filling in/)).toBeNull();
  });

  it('[GOVU-15] shows a cut the scope rules out as nothing with no link, says when every lane was counted, and says when the window reaches past what is published', () => {
    const ruledOut = renderWithTheme(<RuledOut />);
    const rows = within(screen.getByRole('table', { name: 'Reach' }))
      .getAllByRole('row')
      .slice(1);
    expect(within(rows[3] as HTMLElement).getAllByRole('cell')[0]?.textContent).toBe('0');
    expect(within(rows[3] as HTMLElement).queryByRole('link')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    ruledOut.unmount();

    renderWithTheme(<EveryLaneDelayed />);
    expect(screen.getByText('No lanes were named, so every lane is counted.')).toBeTruthy();
    expect(screen.getByText(/every count here is short by those awards/)).toBeTruthy();
  });
});
