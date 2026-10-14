import { noticeRefOf, opportunityOf } from '@sysdesign/contracts';
import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AWARD_DETAIL } from '../../testing/spending-fixtures';
import { AwardClient } from './award.client';

const ID = AWARD_DETAIL.externalId;
const PATH = `/spending/awards/${ID}`;
const TRACKED = `/targets/award/${ID}`;
/** Nobody tracks it yet. */
const untracked = { path: TRACKED, body: { data: null } };

afterEach(() => vi.unstubAllGlobals());

describe('AwardClient', () => {
  it('[GOVU-18] reads one award by its id and shows its record, its subcontractors, the open notices from the same buyer and code, and where the answer came from', async () => {
    const { calls } = stubApi([
      {
        path: PATH,
        body: { data: { ...AWARD_DETAIL, openNotices: [noticeRefOf(opportunityOf())] } },
      },
      untracked,
    ]);
    renderWithTheme(<AwardClient externalId={ID} />);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      '89303019FET000003',
    );
    // One read of the source's record, and one of the store: whether the award is tracked.
    await screen.findByRole('button', { name: 'Track this award' });
    expect(calls.map((call) => call.url)).toEqual([PATH, TRACKED]);
    expect(screen.getByRole('table', { name: 'Award facts' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Subcontracts under this award' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Open notices' })).toBeTruthy();
    expect(screen.getByText(/usaspending · data as of 2026-06-14/)).toBeTruthy();
  });

  it('[GOVU-18] makes an id the source does not have a dead end with a way back, and any other failure one that can be retried', async () => {
    stubApi([{ path: PATH, status: 404, body: { statusCode: 404, message: `no award ${ID}` } }]);
    const gone = renderWithTheme(<AwardClient externalId={ID} />);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('No such award');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toBeTruthy();
    gone.unmount();
    vi.unstubAllGlobals();

    let down = true;
    stubApi([
      {
        path: PATH,
        handler: () =>
          down
            ? { status: 502, body: { statusCode: 502, message: 'error: status 503' } }
            : { body: { data: AWARD_DETAIL } },
      },
      untracked,
    ]);
    renderWithTheme(<AwardClient externalId={ID} />);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      'The award could not be loaded',
    );
    down = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('89303019FET000003'),
    );
  });
});
