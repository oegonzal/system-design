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
import {
  AWARDS,
  AWARDS_SUMMARY,
  DESCRIPTION,
  ENTITY,
  makeLeadDetail,
  NOTICE_ID,
  PROFILE,
} from '../../testing/fixtures';
import { BID } from '../../testing/pipeline-fixtures';
import { NoticeClient } from './notice.client';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

const ATTACHMENT =
  'https://sam.gov/api/prod/opps/v3/opportunities/resources/files/c30288c45b7b4fb39e647a2eab150983/download';
const full = () =>
  makeLeadDetail({
    attachments: [{ ordinal: 0, url: ATTACHMENT }],
    awards: { bySolicitation: AWARDS.slice(0, 1), related: AWARDS_SUMMARY },
  });
const noticePath = new RegExp(`^/notices/${NOTICE_ID}$`);
const profiles: StubRoute = { path: '/profiles', body: { data: [PROFILE] } };

const mount = () =>
  renderWithTheme(
    <ProfileProvider>
      <NoticeClient noticeId={NOTICE_ID} />
    </ProfileProvider>,
  );

beforeEach(() => resetNavigationMock());
afterEach(() => vi.unstubAllGlobals());

describe('NoticeClient', () => {
  it('[GOVU-8] shows the facts, the place, the attachments, the awards and the bid, and puts the notice in the pipeline', async () => {
    const { calls, fetchMock } = stubApi([
      profiles,
      {
        path: noticePath,
        sequence: [{ data: full() }, { data: { ...full(), bid: BID } }],
      },
      { method: 'PUT', path: new RegExp(`^/notices/${NOTICE_ID}/bid$`), body: { data: BID } },
    ]);
    mount();
    await screen.findByRole('heading', { name: '59--JUNCTION BOX, IN REPAIR/MODIFICATION OF' });
    expect(calls.map((call) => call.url)).toContain(`/notices/${NOTICE_ID}?profile=enfav`);
    expect(screen.getByText('Place of performance: Mechanicsburg, PA, 17050, USA')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Attachment 1' }).getAttribute('href')).toBe(
      ATTACHMENT,
    );
    expect(screen.getByRole('table', { name: 'Factor trace' })).toBeTruthy();
    expect(
      within(screen.getByRole('table', { name: 'Awards on this solicitation' })).getByText(
        'PRECISION PARTS CO',
      ),
    ).toBeTruthy();
    expect(screen.getByText('not in the pipeline')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Stage'), { target: { value: 'qualifying' } });
    fireEvent.click(screen.getByRole('button', { name: 'Track this notice' }));
    await screen.findByText('Bid saved: qualifying.');
    const put = fetchMock.mock.calls.find((call) => (call[1] as RequestInit).method === 'PUT');
    expect(JSON.parse(String((put?.[1] as RequestInit).body))).toEqual({
      stage: 'qualifying',
      notes: '',
      reminderAt: null,
      estimatedValue: null,
    });
    await waitFor(() => expect(screen.getByText(/in this stage since 2026-09-27/)).toBeTruthy());
    expect(calls.filter((call) => call.url.startsWith(`/notices/${NOTICE_ID}?`))).toHaveLength(2);
  });

  it('[GOVU-3] fetches the description on demand and shows the stored text after re-reading the notice', async () => {
    const { calls } = stubApi([
      profiles,
      {
        path: noticePath,
        sequence: [{ data: full() }, { data: { ...full(), description: DESCRIPTION } }],
      },
      {
        method: 'POST',
        path: new RegExp(`^/notices/${NOTICE_ID}/description$`),
        body: { data: { status: 'ok', description: DESCRIPTION } },
      },
    ]);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Fetch description (1 request)' }));
    await screen.findByText(/Delivery: 90 days ARO/);
    expect(calls.filter((call) => call.method === 'POST').map((call) => call.url)).toEqual([
      `/notices/${NOTICE_ID}/description`,
    ]);
    expect(screen.getByText('Description fetched and stored.')).toBeTruthy();
  });

  it('[GOVU-3] says when the budget refused the description, beside that notice, and keeps the button', async () => {
    stubApi([
      profiles,
      { path: noticePath, body: { data: full() } },
      {
        method: 'POST',
        path: new RegExp(`^/notices/${NOTICE_ID}/description$`),
        body: { data: { status: 'budget-exhausted', spent: 10, budget: 10 } },
      },
    ]);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Fetch description (1 request)' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The budget is spent: 10 of 10 requests used in the last 24 h.',
    );
    expect(screen.getByRole('button', { name: 'Fetch description (1 request)' })).toBeTruthy();
  });

  it('[GOVU-8] looks an awardee up for one request and shows its registration', async () => {
    const { calls } = stubApi([
      profiles,
      { path: noticePath, body: { data: full() } },
      {
        method: 'POST',
        path: '/entities/lookup',
        body: { data: { entities: [ENTITY], unknown: [], spent: 4, budget: 1000 } },
      },
    ]);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Look up awardee (1 request)' }));
    await screen.findByRole('heading', { name: 'PRECISION PARTS CO' });
    expect(
      screen.getByText(
        'UEI ABC123DEF456 · CAGE 1AB23 · registration expires 2027-03-01 · looked up 2026-09-27',
      ),
    ).toBeTruthy();
    expect(calls.filter((call) => call.method === 'POST').map((call) => call.url)).toEqual([
      '/entities/lookup',
    ]);
  });

  it('renders a dead end with a way back when the notice is not stored, however the server words it', async () => {
    stubApi([
      profiles,
      // The status decides: the wording is the server's to change.
      { path: noticePath, status: 404, body: { statusCode: 404, message: 'Not Found' } },
    ]);
    mount();
    await screen.findByRole('heading', { name: 'No such notice' });
    expect(screen.getByRole('link', { name: 'Back to the dashboard' }).getAttribute('href')).toBe(
      '/',
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('offers a retry in the server’s own words when the read failed, and loads on the next try', async () => {
    let reads = 0;
    stubApi([
      profiles,
      {
        path: noticePath,
        handler: () => {
          reads += 1;
          return reads === 1
            ? { status: 500, body: { statusCode: 500, message: 'The store is restarting.' } }
            : { body: { data: full() } };
        },
      },
    ]);
    mount();
    await screen.findByRole('heading', { name: 'The notice could not be loaded' });
    expect(screen.getByText('The store is restarting.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('heading', { name: '59--JUNCTION BOX, IN REPAIR/MODIFICATION OF' });
  });
});
