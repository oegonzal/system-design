import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FIRM_TARGET, TARGET, TARGET_SUMMARY, TARGETS } from '../../testing/fixtures';
import { TargetsView } from './targets-view.client';

afterEach(() => vi.unstubAllGlobals());

describe('TargetsView', () => {
  it('[GOVU-20] lists the tracked firms and awards with their counts, narrows to one kind, and writes a stage changed in the row back under the target’s own name before reading the list and the counts again', async () => {
    let rows = TARGETS;
    const { calls, fetchMock } = stubApi([
      { path: '/targets/summary', body: { data: TARGET_SUMMARY } },
      {
        path: '/targets',
        handler: ({ url }) => {
          const kind = url.searchParams.get('kind');
          const shown = kind === null ? rows : rows.filter((row) => row.kind === kind);
          return { body: { data: shown, meta: { total: shown.length, limit: 50, offset: 0 } } };
        },
      },
      {
        method: 'PUT',
        path: /^\/targets\/(firm|award)\//,
        handler: ({ url, init }) => {
          const body = JSON.parse(String(init?.body)) as Partial<typeof TARGET>;
          rows = rows.map((row) =>
            url.pathname.endsWith(`/${row.subject}`) ? { ...row, ...body } : row,
          );
          return { body: { data: rows.find((row) => url.pathname.endsWith(`/${row.subject}`)) } };
        },
      },
    ]);
    renderWithTheme(<TargetsView />);
    await screen.findByRole('table', { name: 'Tracked firms and awards' });
    expect(screen.getByRole('list', { name: 'Firms by stage' })).toBeTruthy();
    expect(calls.map((call) => call.url)).toEqual(
      expect.arrayContaining(['/targets/summary', '/targets?limit=50&offset=0']),
    );
    expect(screen.getByText('1–2 of 2')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'firm' } });
    await screen.findByText('1–1 of 1');
    expect(calls.map((call) => call.url)).toContain('/targets?kind=firm&limit=50&offset=0');

    const before = calls.length;
    fireEvent.change(screen.getByLabelText(`Stage of ${FIRM_TARGET.label}`), {
      target: { value: 'talking' },
    });
    await screen.findByText(`${FIRM_TARGET.label} moved to talking.`);
    const put = fetchMock.mock.calls.find((call) => (call[1] as RequestInit).method === 'PUT');
    expect(String(put?.[0])).toContain('/targets/firm/JCBMLGPE6Z71');
    expect(JSON.parse(String((put?.[1] as RequestInit).body))).toEqual({
      label: FIRM_TARGET.label,
      stage: 'talking',
    });
    await waitFor(() => {
      expect(calls.slice(before).map((call) => call.url)).toEqual(
        expect.arrayContaining(['/targets/summary', '/targets?kind=firm&limit=50&offset=0']),
      );
    });
    await waitFor(() =>
      expect(
        (screen.getByLabelText(`Stage of ${FIRM_TARGET.label}`) as HTMLSelectElement).value,
      ).toBe('talking'),
    );
  });

  it('[GOVU-20] saves the whole of a target edited under its row and closes it, keeps a refused edit open with what was typed, and stops tracking in one DELETE', async () => {
    let rows = TARGETS;
    let refuse = true;
    const { fetchMock } = stubApi([
      { path: '/targets/summary', body: { data: TARGET_SUMMARY } },
      {
        path: '/targets',
        handler: () => ({
          body: { data: rows, meta: { total: rows.length, limit: 50, offset: 0 } },
        }),
      },
      {
        method: 'PUT',
        path: /^\/targets\/award\//,
        handler: ({ init }) => {
          if (refuse) {
            refuse = false;
            return { status: 400, body: { statusCode: 400, message: 'notes: too long' } };
          }
          const saved = {
            ...TARGET,
            ...(JSON.parse(String(init?.body)) as Partial<typeof TARGET>),
          };
          rows = rows.map((row) => (row.id === saved.id ? saved : row));
          return { body: { data: saved } };
        },
      },
      {
        method: 'DELETE',
        path: /^\/targets\/award\//,
        handler: () => {
          rows = rows.filter((row) => row.id !== TARGET.id);
          return { status: 204, body: undefined };
        },
      },
    ]);
    renderWithTheme(<TargetsView />);
    await screen.findByRole('table', { name: 'Tracked firms and awards' });
    fireEvent.click(screen.getByRole('button', { name: `Edit ${TARGET.label}` }));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Recompete in March.' } });
    fireEvent.change(screen.getByLabelText('Contact'), { target: { value: 'A. Officer' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe('notes: too long');
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe(
      'Recompete in March.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(`${TARGET.label} saved.`);
    const puts = fetchMock.mock.calls.filter((call) => (call[1] as RequestInit).method === 'PUT');
    expect(JSON.parse(String((puts.at(-1)?.[1] as RequestInit).body))).toEqual({
      label: TARGET.label,
      stage: 'watching',
      notes: 'Recompete in March.',
      contact: 'A. Officer',
      reminderAt: null,
    });
    await waitFor(() => expect(screen.queryByLabelText('Notes')).toBeNull());
    await screen.findByText('Recompete in March.');

    fireEvent.click(screen.getByRole('button', { name: `Edit ${TARGET.label}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop tracking' }));
    await screen.findByText(`${TARGET.label} is no longer tracked.`);
    await screen.findByText('1–1 of 1');
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          (call[1] as RequestInit).method === 'DELETE' &&
          String(call[0]).endsWith(`/targets/award/${TARGET.subject}`),
      ),
    ).toBe(true);
  });

  it('shows the service error where the list would be and keeps the counts', async () => {
    stubApi([
      { path: '/targets/summary', body: { data: TARGET_SUMMARY } },
      { path: '/targets', status: 500, body: { statusCode: 500, message: 'the store is down' } },
    ]);
    renderWithTheme(<TargetsView />);
    expect((await screen.findByRole('alert')).textContent).toBe('the store is down');
    expect(screen.getByRole('list', { name: 'Awards by stage' })).toBeTruthy();
  });
});
