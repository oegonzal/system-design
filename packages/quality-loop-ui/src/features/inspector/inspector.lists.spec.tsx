import { MAX_LIST_LIMIT, type RunOpenerDto } from '@sysdesign/contracts';
import type * as WebTesting from '@sysdesign/web-testing';
import {
  renderWithTheme,
  resetNavigationMock,
  routerMock,
  setMockSearchParams,
  stubApi,
} from '@sysdesign/web-testing';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeOrchestration, makeRunSummary, RUN_SUMMARIES } from '../../testing/fixtures';
import { InspectorClient } from './inspector.client';
import { advance, complete, open, ORCHESTRATIONS, PIPELINES, RUNS } from './testing';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

beforeEach(() => {
  vi.useFakeTimers();
  resetNavigationMock();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A table's rows as cells by column name, so a column's position is not this spec's business. */
const cellsOf = (table: HTMLElement): Record<string, string>[] => {
  const headers = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent ?? '');
  return [...table.querySelectorAll('tbody tr')].map((row) =>
    Object.fromEntries(
      [...row.querySelectorAll('td')].map((cell, at) => [headers[at], cell.textContent ?? '']),
    ),
  );
};

describe('InspectorClient', () => {
  it('[QLU-12] the orchestration picker can be opened without one already being inspected', async () => {
    // Slaving the open picker to the selected target made the orchestration list
    // unreachable: a reader with no orchestration in the URL could never get to
    // one, so the only way in was to hand-write the query string.
    stubApi([
      RUNS,
      PIPELINES,
      {
        path: '/orchestrations',
        body: { data: [makeOrchestration()], meta: { total: 1, limit: 30, offset: 0 } },
      },
    ]);
    setMockSearchParams({});
    renderWithTheme(<InspectorClient />);
    await advance(0);

    expect(screen.queryByRole('table', { name: 'Orchestrations to inspect' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Orchestrations' }));
    await advance(0);
    const table = screen.getByRole('table', { name: 'Orchestrations to inspect' });
    expect(table.textContent).toContain('calibration');
    // And the run picker is still one click away.
    fireEvent.click(screen.getByRole('tab', { name: 'Quality runs' }));
    await advance(0);
    expect(screen.getByRole('table', { name: 'Runs to inspect' })).toBeTruthy();
  });

  it('[QLU-11] the pickers are read again when the followed run ends, so the next one appears', async () => {
    // Someone watching a run-through leaves this page open. Reading the lists
    // once would freeze them: the run they are following ends and the one that
    // started after it never shows up.
    const later = makeRunSummary({
      runId: '2026-10-02T09-00-00-000-newrun-quality',
      status: 'running',
      finalDecision: null,
      stopReason: null,
      overall: null,
    });
    stubApi([
      {
        path: '/runs',
        // First read: the three it already knows. Second read, after the followed
        // run ends: a fourth that started meanwhile.
        sequence: [
          { data: RUN_SUMMARIES, meta: { total: 3, limit: 30, offset: 0 } },
          { data: [later, ...RUN_SUMMARIES], meta: { total: 4, limit: 30, offset: 0 } },
        ],
      },
      PIPELINES,
      ORCHESTRATIONS,
      {
        path: `/runs/${complete.runId}`,
        sequence: [{ data: open }, { data: complete }],
      },
    ]);
    setMockSearchParams({ run: complete.runId });
    renderWithTheme(<InspectorClient />);
    await advance(0);

    const picker = () => screen.getByRole('table', { name: 'Runs to inspect' });
    expect(picker().querySelectorAll('tbody tr')).toHaveLength(RUN_SUMMARIES.length);

    // The run reaches its end, polling stops, and the lists are read again.
    await advance(1200);
    await advance(1200);
    expect(picker().querySelectorAll('tbody tr')).toHaveLength(RUN_SUMMARIES.length + 1);
  });

  it('[QLU-14] narrows both lists to one opener, read from the loop, and keeps the filter on every link', async () => {
    const SESSION = 'e657ef24-0c1d-4b2e-9f3a-1d2c3b4a5f60';
    const opened = (label: string): RunOpenerDto => ({
      kind: 'browser-session',
      id: SESSION,
      label,
    });
    const firstStep = makeRunSummary({
      runId: '2026-10-10T06-33-00-000-aaa111-quality',
      pipeline: 'browser-step',
      startedAt: '2026-10-10T06:33:00.000Z',
      criteria: 31,
      openedBy: opened('step 1'),
    });
    const secondStep = makeRunSummary({
      runId: '2026-10-10T06-40-00-000-bbb222-quality',
      pipeline: 'browser-step',
      startedAt: '2026-10-10T06:40:00.000Z',
      criteria: 27,
      openedBy: opened('step 2'),
    });
    const formPage = makeOrchestration({
      orchestrationRunId: '22222222-3333-4444-5555-666666666666',
      orchestrator: 'form-memory',
      startedAt: '2026-10-10T06:41:00.000Z',
      openedBy: opened('step 2 · form page'),
    });
    const page = (data: unknown[]) => ({
      body: { data, meta: { total: data.length, limit: 30, offset: 0 } },
    });
    const narrowed = (url: URL) => url.searchParams.get('openedBy') === SESSION;
    // The recent window holds the session's latest step only; its first is the
    // loop's to find. Both lists answer newest first, as the loop lists them.
    const stub = stubApi([
      {
        path: '/runs',
        handler: ({ url }) =>
          page(narrowed(url) ? [secondStep, firstStep] : [secondStep, ...RUN_SUMMARIES]),
      },
      PIPELINES,
      {
        path: '/orchestrations',
        handler: ({ url }) => page(narrowed(url) ? [formPage] : [formPage, makeOrchestration()]),
      },
    ]);
    setMockSearchParams({});
    const { rerender } = renderWithTheme(<InspectorClient />);
    await advance(0);

    // Every row says who opened it, and each run how many criteria judged it.
    const runs = () => screen.getByRole('table', { name: 'Runs to inspect' });
    expect(cellsOf(runs()).map((row) => [row['Opened by'], row['Criteria']])).toEqual([
      ['browser-session e657ef24 · step 2', '27'],
      ...RUN_SUMMARIES.map((run) => ['—', String(run.criteria)]),
    ]);

    // The filter offers the openers the recent records name; choosing one writes it to the URL.
    const filter = screen.getByRole('combobox', { name: 'Opened by' });
    expect([...filter.querySelectorAll('option')].map((option) => option.value)).toEqual([
      '',
      SESSION,
    ]);
    fireEvent.change(filter, { target: { value: SESSION } });
    expect(String(routerMock.replace.mock.calls.at(-1)?.[0])).toBe(`/inspect?openedBy=${SESSION}`);

    // The router's part: the URL now names the opener.
    setMockSearchParams({ openedBy: SESSION });
    await act(async () => {
      rerender(<InspectorClient />);
    });
    await advance(0);

    // Both lists are read again, narrowed by the loop itself and a whole page long.
    const reads = stub.calls.map((call) => new URL(call.url, 'http://localhost')).filter(narrowed);
    expect(reads.map((url) => url.pathname).sort()).toEqual(['/orchestrations', '/runs']);
    expect(reads.map((url) => url.searchParams.get('limit'))).toEqual([
      String(MAX_LIST_LIMIT),
      String(MAX_LIST_LIMIT),
    ]);

    // The whole session, step by step: its first step too, though it was never recent.
    expect(cellsOf(runs()).map((row) => row['Opened by'])).toEqual([
      'browser-session e657ef24 · step 1',
      'browser-session e657ef24 · step 2',
    ]);
    expect(screen.getByText('Oldest first — runs: 2, orchestrations: 1.')).toBeTruthy();
    const keepsFilter = (table: HTMLElement) =>
      within(table)
        .getAllByRole('link')
        .map((link) =>
          new URL(link.getAttribute('href') ?? '', 'http://localhost').searchParams.get('openedBy'),
        );
    expect(keepsFilter(runs())).toEqual([SESSION, SESSION]);

    fireEvent.click(screen.getByRole('tab', { name: 'Orchestrations' }));
    await advance(0);
    const orchestrations = screen.getByRole('table', { name: 'Orchestrations to inspect' });
    expect(cellsOf(orchestrations).map((row) => row['Opened by'])).toEqual([
      'browser-session e657ef24 · step 2 · form page',
    ]);
    expect(keepsFilter(orchestrations)).toEqual([SESSION]);
  });
});
