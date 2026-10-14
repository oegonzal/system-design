import { renderWithTheme } from '@sysdesign/web-testing';
import { composeStories } from '@storybook/react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ALERT_VIEW } from '../../testing/spending-fixtures';
import * as stories from './alert-list.stories';

const { Default, Paged, Empty } = composeStories(stories);
const AWARD = ALERT_VIEW.key.subject;

describe('AlertList', () => {
  it('[GOVU-21] lists what was raised newest first, each as the line that was sent with its kind and the day it was raised, and links to the things it names', () => {
    renderWithTheme(<Default />);
    const [lead, followOn, moved, pulse, ending, ...rest] = within(
      screen.getByRole('list', { name: 'Alerts' }),
    ).getAllByRole('listitem');
    expect(rest).toHaveLength(1);
    const links = (item: HTMLElement | undefined) =>
      within(item as HTMLElement)
        .queryAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]);

    // What the daily pull raised: a notice the profile ranks in the tier it asks to hear about.
    expect(lead?.textContent).toContain('New lead');
    expect(lead?.textContent).toContain('raised 2026-09-29');
    expect(lead?.textContent).toContain(
      'New high lead, scored 81.5: “Enterprise data platform modernization” (Sources Sought, due 2026-10-20), HEADQUARTERS PROCUREMENT SERVICES.',
    );
    expect(links(lead)).toEqual([['Notice', '/notices/n-9']]);

    expect(followOn?.textContent).toContain('Possible follow-on');
    expect(followOn?.textContent).toContain('raised 2026-09-28');
    expect(followOn?.textContent).toContain(
      'A stored notice may follow 89303019FET000003: “Cyber support follow-on” (Sources Sought, due 2026-11-15), same buyer and code.',
    );
    // The notice first — it is what can be acted on — then the award it may follow.
    expect(links(followOn)).toEqual([
      ['Notice', '/notices/n-1'],
      ['Award', `/awards/${AWARD}`],
    ]);

    expect(moved?.textContent).toContain('End moved');
    expect(moved?.textContent).toContain('now ends 2027-12-26, not 2026-12-26');
    expect(links(moved)).toEqual([['Award', `/awards/${AWARD}`]]);

    expect(pulse?.textContent).toContain('Spending above its band');
    expect(pulse?.textContent).toContain('FY2026 period 12 (Sep) has $9.1B obligated so far');
    expect(links(pulse)).toEqual([['Pulse', '/spending']]);

    expect(ending?.textContent).toContain('Award ending');
    expect(ending?.textContent).toContain('ends 2026-12-26, in 90 day(s)');
    expect(links(ending)).toEqual([['Award', `/awards/${AWARD}`]]);
  });

  it('[GOVU-21] names an alert kept without what was published by its key, still linking an ending award by its id, pages, and says what raises an alert when nothing has been', () => {
    const all = renderWithTheme(<Default />);
    const old = within(screen.getByRole('list', { name: 'Alerts' }))
      .getAllByRole('listitem')
      .at(-1);
    expect(old?.textContent).toContain('Award ending');
    expect(old?.textContent).toContain('CONT_AWD_OLD_9700_-NONE-_-NONE-');
    expect(
      within(old as HTMLElement)
        .getByRole('link', { name: 'Award' })
        .getAttribute('href'),
    ).toBe('/awards/CONT_AWD_OLD_9700_-NONE-_-NONE-');
    all.unmount();

    // A new lead's key is its notice, so it still leads there.
    const keyed = renderWithTheme(
      <Default
        alerts={[
          {
            id: 'a-9',
            key: { kind: 'lead-new', subject: 'n-9' },
            profileId: 'enfav',
            raisedAt: '2026-09-29T03:00:00.000Z',
            alert: null,
          },
        ]}
        total={1}
      />,
    );
    expect(screen.getByRole('link', { name: 'Notice' }).getAttribute('href')).toBe('/notices/n-9');
    keyed.unmount();

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
    expect(
      screen.getByText(/the daily pull raises one for each notice the profile ranks/),
    ).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Alerts' })).toBeNull();
  });
});
