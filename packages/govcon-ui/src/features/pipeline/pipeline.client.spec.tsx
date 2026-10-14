import type * as WebTesting from '@sysdesign/web-testing';
import {
  renderWithTheme,
  resetNavigationMock,
  routerMock,
  setMockSearchParams,
  stubApi,
} from '@sysdesign/web-testing';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileProvider } from '../../providers/profile-context';
import { PROFILE } from '../../testing/fixtures';
import {
  BID,
  PIPELINE_ROWS,
  PIPELINE_SUMMARY,
  TARGET_SUMMARY,
  TARGETS,
} from '../../testing/pipeline-fixtures';
import { PipelineClient } from './pipeline.client';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

const mount = () =>
  renderWithTheme(
    <ProfileProvider>
      <PipelineClient />
    </ProfileProvider>,
  );

beforeEach(() => resetNavigationMock());
afterEach(() => vi.unstubAllGlobals());

describe('PipelineClient', () => {
  it('[GOVU-20] opens on the tracked notices and reads nothing of the targets; the address names the other view, which then reads nothing of the notices; and choosing a view puts it in the address', async () => {
    const routes = [
      { path: '/profiles', body: { data: [PROFILE] } },
      { path: '/pipeline/summary', body: { data: PIPELINE_SUMMARY } },
      {
        path: '/pipeline',
        body: { data: PIPELINE_ROWS, meta: { total: 3, limit: 50, offset: 0 } },
      },
      { path: '/targets/summary', body: { data: TARGET_SUMMARY } },
      { path: '/targets', body: { data: TARGETS, meta: { total: 2, limit: 50, offset: 0 } } },
    ];
    const first = stubApi(routes);
    const bids = mount();
    await screen.findByRole('table', { name: 'Pipeline' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Pipeline');
    expect(screen.getByRole('tab', { name: 'Notices' }).getAttribute('aria-selected')).toBe('true');
    expect(first.calls.some((call) => call.url.startsWith('/targets'))).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: 'Firms and awards' }));
    expect(routerMock.replace).toHaveBeenLastCalledWith('/pipeline?view=targets');
    bids.unmount();
    vi.unstubAllGlobals();

    const second = stubApi(routes);
    setMockSearchParams('view=targets');
    mount();
    await screen.findByRole('table', { name: 'Tracked firms and awards' });
    expect(
      screen.getByRole('tab', { name: 'Firms and awards' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(second.calls.some((call) => call.url.startsWith('/pipeline'))).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: 'Notices' }));
    expect(routerMock.replace).toHaveBeenLastCalledWith('/pipeline');
  });

  it('[GOVU-7] lists the tracked notices for the active profile with the counts, filters by stage tab, and writes a stage change back', async () => {
    const { calls, fetchMock } = stubApi([
      { path: '/profiles', body: { data: [PROFILE] } },
      { path: '/pipeline/summary', body: { data: PIPELINE_SUMMARY } },
      {
        path: '/pipeline',
        handler: ({ url }) => {
          const stage = url.searchParams.get('stage');
          const rows =
            stage === null ? PIPELINE_ROWS : PIPELINE_ROWS.filter((row) => row.bid.stage === stage);
          return { body: { data: rows, meta: { total: rows.length, limit: 50, offset: 0 } } };
        },
      },
      {
        method: 'PUT',
        path: /\/notices\/[^/]+\/bid$/,
        body: { data: { ...BID, stage: 'preparing' } },
      },
    ]);
    mount();
    await screen.findByRole('table', { name: 'Pipeline' });
    expect(screen.getByRole('list', { name: 'Pipeline summary' })).toBeTruthy();
    expect(calls.map((call) => call.url)).toContain('/pipeline?profile=enfav&limit=50&offset=0');
    expect(screen.getByText('3 tracked · showing 1–3 of 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'submitted' }));
    await screen.findByText('1 tracked · showing 1–1 of 1');
    expect(calls.map((call) => call.url)).toContain(
      '/pipeline?profile=enfav&stage=submitted&limit=50&offset=0',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'all' }));
    await screen.findByText('3 tracked · showing 1–3 of 3');
    const before = calls.length;
    fireEvent.change(screen.getAllByLabelText(/^Stage of/)[0] as HTMLSelectElement, {
      target: { value: 'preparing' },
    });
    await screen.findByText('Moved to preparing.');
    const put = fetchMock.mock.calls.find((call) => (call[1] as RequestInit).method === 'PUT');
    expect(String(put?.[0])).toContain('/notices/21b781192a4f4026a2946237984a9c06/bid');
    expect(JSON.parse(String((put?.[1] as RequestInit).body))).toEqual({ stage: 'preparing' });
    await waitFor(() => {
      expect(calls.slice(before).map((call) => call.url)).toEqual(
        expect.arrayContaining(['/pipeline/summary', '/pipeline?profile=enfav&limit=50&offset=0']),
      );
    });
  });

  it('[GOVU-7] writes a reminder, a note and an estimate edited under the row as one bid, closes it, and shows what the service then answers; a refusal stays in the open bid; a removal is one DELETE', async () => {
    let rows = PIPELINE_ROWS;
    let refuse = true;
    const { fetchMock } = stubApi([
      { path: '/profiles', body: { data: [PROFILE] } },
      { path: '/pipeline/summary', body: { data: PIPELINE_SUMMARY } },
      {
        path: '/pipeline',
        handler: () => ({
          body: { data: rows, meta: { total: rows.length, limit: 50, offset: 0 } },
        }),
      },
      {
        method: 'PUT',
        path: /\/notices\/[^/]+\/bid$/,
        handler: ({ init }) => {
          if (refuse) {
            refuse = false;
            return { status: 400, body: { statusCode: 400, message: 'estimatedValue: too large' } };
          }
          const saved = { ...BID, ...(JSON.parse(String(init?.body)) as Partial<typeof BID>) };
          rows = rows.map((row) =>
            row.bid.noticeId === saved.noticeId ? { ...row, bid: saved } : row,
          );
          return { body: { data: saved } };
        },
      },
      {
        method: 'DELETE',
        path: /\/notices\/[^/]+\/bid$/,
        handler: ({ url }) => {
          rows = rows.filter((row) => !url.pathname.includes(row.bid.noticeId));
          return { status: 204, body: undefined };
        },
      },
    ]);
    mount();
    await screen.findByRole('table', { name: 'Pipeline' });
    fireEvent.click(screen.getByRole('button', { name: /^Edit the bid on .*JUNCTION BOX/ }));
    fireEvent.change(screen.getByLabelText('Reminder (UTC)'), {
      target: { value: '2026-11-02T15:30' },
    });
    fireEvent.change(screen.getByLabelText('Estimated value (USD)'), {
      target: { value: '90000' },
    });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Quote by the 2nd.' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save bid' }));
    expect((await screen.findByRole('alert')).textContent).toBe('estimatedValue: too large');
    // Refused: the bid stays open with what was typed.
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Quote by the 2nd.');

    fireEvent.click(screen.getByRole('button', { name: 'Save bid' }));
    await screen.findByText('Bid saved.');
    const puts = fetchMock.mock.calls.filter((call) => (call[1] as RequestInit).method === 'PUT');
    expect(JSON.parse(String((puts.at(-1)?.[1] as RequestInit).body))).toEqual({
      stage: 'qualifying',
      notes: 'Quote by the 2nd.',
      reminderAt: '2026-11-02T15:30:00.000Z',
      estimatedValue: 90000,
    });
    await waitFor(() => expect(screen.queryByLabelText('Notes')).toBeNull());
    const row = (await screen.findByText('Quote by the 2nd.')).closest('tr') as HTMLElement;
    expect(row.textContent).toContain('2026-11-02');
    expect(row.textContent).toContain('$90K');

    fireEvent.click(screen.getByRole('button', { name: /^Edit the bid on .*JUNCTION BOX/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from pipeline' }));
    await screen.findByText('Removed from the pipeline.');
    await screen.findByText('2 tracked · showing 1–2 of 2');
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          (call[1] as RequestInit).method === 'DELETE' &&
          String(call[0]).includes('/notices/21b781192a4f4026a2946237984a9c06/bid'),
      ),
    ).toBe(true);
  });

  it('shows the service error where the page would be and keeps the counts', async () => {
    stubApi([
      { path: '/profiles', body: { data: [PROFILE] } },
      { path: '/pipeline/summary', body: { data: PIPELINE_SUMMARY } },
      { path: '/pipeline', status: 500, body: { statusCode: 500, message: 'the store is down' } },
    ]);
    mount();
    expect((await screen.findByRole('alert')).textContent).toBe('the store is down');
    expect(screen.getByRole('list', { name: 'Pipeline summary' })).toBeTruthy();
  });
});
