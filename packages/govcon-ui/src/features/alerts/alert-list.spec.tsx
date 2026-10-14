import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ALERT_VIEW } from '../../testing/spending-fixtures';
import * as stories from './alert-list.stories';

const { Default, Paged, Empty } = composeStories(stories);
const AWARD = ALERT_VIEW.key.subject;

describe('AlertList', () => {
  it('[GOVU-21] lists what the warm raised newest first, each as the line that was sent with its kind and the day it was raised, and links to the things it names', () => {
    renderWithTheme(<Default />);
    const items = within(screen.getByRole('list', { name: 'Alerts' })).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    const links = (item: HTMLElement | undefined) =>
      within(item as HTMLElement)
        .queryAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]);

    expect(items[0]?.textContent).toContain('Possible follow-on');
    expect(items[0]?.textContent).toContain('raised 2026-09-28');
    expect(items[0]?.textContent).toContain(
      'A stored notice may follow 89303019FET000003: “Cyber support follow-on” (Sources Sought, due 2026-11-15), same buyer and code.',
    );
    // The notice first — it is what can be acted on — then the award it may follow.
    expect(links(items[0])).toEqual([
      ['Notice', '/notices/n-1'],
      ['Award', `/awards/${AWARD}`],
    ]);

    expect(items[1]?.textContent).toContain('End moved');
    expect(items[1]?.textContent).toContain('now ends 2027-12-26, not 2026-12-26');
    expect(links(items[1])).toEqual([['Award', `/awards/${AWARD}`]]);

    expect(items[2]?.textContent).toContain('Spending above its band');
    expect(items[2]?.textContent).toContain('FY2026 period 12 (Sep) has $9.1B obligated so far');
    expect(links(items[2])).toEqual([['Pulse', '/spending']]);

    expect(items[3]?.textContent).toContain('Award ending');
    expect(items[3]?.textContent).toContain('ends 2026-12-26, in 90 day(s)');
    expect(links(items[3])).toEqual([['Award', `/awards/${AWARD}`]]);
  });

  it('[GOVU-21] names an alert kept without what was published by its key, still linking an ending award by its id, pages, and says what raises an alert when nothing has been', () => {
    const all = renderWithTheme(<Default />);
    const old = within(screen.getByRole('list', { name: 'Alerts' })).getAllByRole('listitem')[4];
    expect(old?.textContent).toContain('Award ending');
    expect(old?.textContent).toContain('CONT_AWD_OLD_9700_-NONE-_-NONE-');
    expect(
      within(old as HTMLElement)
        .getByRole('link', { name: 'Award' })
        .getAttribute('href'),
    ).toBe('/awards/CONT_AWD_OLD_9700_-NONE-_-NONE-');
    all.unmount();

    const onPage = vi.fn();
    const paged = renderWithTheme(<Paged onPage={onPage} />);
    expect(screen.getByText('11–20 of 37')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage).toHaveBeenCalledWith(0);
    paged.unmount();

    renderWithTheme(<Empty />);
    expect(
      screen.getByText(/Nothing raised yet\. The daily warm raises an alert when/),
    ).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Alerts' })).toBeNull();
  });
});
