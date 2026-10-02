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

import {
  makeOrchestration,
  makePipeline,
  makeRun,
  makeTwoIterationRun,
  ORCHESTRATION_CHILD_IDS,
  RUN_SUMMARIES,
} from '../../testing/fixtures';
import { InspectorClient } from './inspector.client';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

const complete = makeTwoIterationRun();
const open = makeRun({
  runId: complete.runId,
  status: 'running',
  finishedAt: null,
  trace: null,
  exchanges: makeRun().exchanges.slice(0, 2),
});
const partway = makeRun({
  runId: complete.runId,
  status: 'running',
  finishedAt: null,
  trace: {
    ...(complete.trace as NonNullable<typeof complete.trace>),
    iterations: [(complete.trace as NonNullable<typeof complete.trace>).iterations[0]],
    bestIteration: 1,
    finalDecision: 'revise',
    stopReason: null,
    lessons: [],
  },
});

const RUNS = {
  path: '/runs',
  body: { data: RUN_SUMMARIES, meta: { total: 3, limit: 30, offset: 0 } },
};
const PIPELINES = { path: '/pipelines', body: { data: [makePipeline()] } };
const ORCHESTRATIONS = {
  path: '/orchestrations',
  body: { data: [], meta: { total: 0, limit: 30, offset: 0 } },
};

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetNavigationMock();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const rail = () => screen.getByRole('list', { name: 'Actions' });

/** The action key the container last wrote to the URL. */
const lastSelectedKey = (): string | null =>
  new URL(String(routerMock.replace.mock.calls.at(-1)?.[0]), 'http://localhost').searchParams.get(
    'action',
  );

describe('InspectorClient', () => {
  it('[QLU-5] reads what to inspect from the URL and writes a selection back to it', async () => {
    stubApi([
      RUNS,
      PIPELINES,
      ORCHESTRATIONS,
      { path: `/runs/${complete.runId}`, body: { data: complete } },
    ]);
    setMockSearchParams({ run: complete.runId });
    renderWithTheme(<InspectorClient />);
    await advance(0);

    const rows = within(rail()).getAllByRole('button');
    expect(rows.length).toBeGreaterThan(5);
    fireEvent.click(rows[2]);
    const replaced = String(routerMock.replace.mock.calls.at(-1)?.[0]);
    expect(replaced).toContain('/inspect?run=');
    expect(replaced).toContain('action=');
  });

  it('[QLU-6] shows one action at a time, with what it changed in the loop’s memory', async () => {
    stubApi([
      RUNS,
      PIPELINES,
      ORCHESTRATIONS,
      { path: `/runs/${complete.runId}`, body: { data: complete } },
    ]);
    setMockSearchParams({ run: complete.runId });
    const { rerender } = renderWithTheme(<InspectorClient />);
    await advance(0);

    const second = within(rail())
      .getAllByRole('button')
      .find(
        (row) =>
          row.textContent?.includes('Evidence normalised') &&
          row.textContent?.includes('iteration 2'),
      );
    if (second === undefined) throw new Error('no second-iteration normalisation in the rail');
    fireEvent.click(second);
    // Selection lives in the URL, so the harness plays the router's part.
    setMockSearchParams({ run: complete.runId, action: lastSelectedKey() ?? '' });
    await act(async () => {
      rerender(<InspectorClient />);
    });

    // The rail says what happened and where; the detail says what it changed.
    expect(second.textContent).toContain('iteration 2');
    const changes = screen.getByRole('table', { name: 'Changes' });
    expect(changes.textContent).toContain('ledger.criteria[criterion:c2].result');
    expect(changes.textContent).toContain('"fail"');
    expect(changes.textContent).toContain('"pass"');
    expect(changes.textContent).toContain('updated');
    expect(changes.textContent).toContain('removed');
  });

  it('[QLU-8] says what is reconstructed, and marks what a poll actually saw arriving', async () => {
    stubApi([
      RUNS,
      {
        path: `/runs/${complete.runId}`,
        sequence: [{ data: open }, { data: partway }, { data: complete }],
      },
    ]);
    setMockSearchParams({ run: complete.runId });
    renderWithTheme(<InspectorClient />);
    await advance(0);

    // The first snapshot is read back out of the record: honest about order and
    // payload, silent about wall-clock time.
    expect(screen.getByRole('status').textContent).toContain('read back out of one recorded');
    const first = within(rail()).getAllByRole('button');
    expect(first.every((row) => row.textContent?.includes('reconstructed'))).toBe(true);
    const openCount = first.length;

    await advance(1200);
    await advance(1200);
    const grown = within(rail()).getAllByRole('button');
    expect(grown.length).toBeGreaterThan(openCount);
    // Everything the polls revealed is marked as seen arriving.
    expect(grown.slice(openCount).every((row) => row.textContent?.includes('recorded'))).toBe(true);
    // And the first entries keep the provenance they were recorded under.
    expect(grown[0].textContent).toContain('reconstructed');
    expect(screen.getByRole('status').textContent).toContain('were seen arriving');
  });

  it('[QLU-8] a selection made before a poll still points at the same action after it', async () => {
    stubApi([
      RUNS,
      {
        path: `/runs/${complete.runId}`,
        sequence: [{ data: open }, { data: partway }, { data: complete }],
      },
    ]);
    setMockSearchParams({ run: complete.runId });
    renderWithTheme(<InspectorClient />);
    await advance(0);

    const chosen = within(rail()).getAllByRole('button')[1];
    const label = chosen.textContent ?? '';
    fireEvent.click(chosen);
    setMockSearchParams({ run: complete.runId, action: lastSelectedKey() ?? '' });
    await advance(1200);
    await advance(1200);

    const still = within(rail())
      .getAllByRole('button')
      .find((row) => row.getAttribute('aria-current') === 'true');
    expect(still?.textContent).toBe(label);
  });

  it('[QLU-11] follows a live run until a row is selected, then offers the way back', async () => {
    stubApi([
      RUNS,
      PIPELINES,
      {
        path: `/runs/${complete.runId}`,
        sequence: [{ data: open }, { data: partway }, { data: partway }, { data: complete }],
      },
    ]);
    setMockSearchParams({ run: complete.runId });
    const { rerender } = renderWithTheme(<InspectorClient />);
    await advance(0);

    // Nothing named: the latest is shown and keeps being the latest.
    expect(screen.getByText('following')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Jump to latest/ })).toBeNull();

    const chosen = within(rail()).getAllByRole('button')[1];
    fireEvent.click(chosen);
    const key = lastSelectedKey();
    setMockSearchParams({ run: complete.runId, action: key ?? '' });
    await act(async () => {
      rerender(<InspectorClient />);
    });

    // Selecting detaches — scrolling never does, because a scroll heuristic
    // fights momentum scrolling and would detach a reader who was only reading.
    expect(screen.queryByText('following')).toBeNull();
    const jump = screen.getByRole('button', { name: /Jump to latest/ });
    const behindAtFirst = Number(/\((\d+) new\)/.exec(jump.textContent ?? '')?.[1] ?? '0');
    expect(behindAtFirst).toBeGreaterThan(0);

    // Entries keep arriving while detached, and the count says how far behind.
    await advance(1200);
    await advance(1200);
    const behindLater = Number(
      /\((\d+) new\)/.exec(
        screen.getByRole('button', { name: /Jump to latest/ }).textContent ?? '',
      )?.[1] ?? '0',
    );
    expect(behindLater).toBeGreaterThan(behindAtFirst);

    // And the way back clears the named action rather than naming the newest.
    fireEvent.click(screen.getByRole('button', { name: /Jump to latest/ }));
    expect(
      new URL(
        String(routerMock.replace.mock.calls.at(-1)?.[0]),
        'http://localhost',
      ).searchParams.get('action'),
    ).toBeNull();
  });

  it('[QLU-11] a finished run is not followed, and says how much of the log it is showing', async () => {
    stubApi([
      RUNS,
      PIPELINES,
      ORCHESTRATIONS,
      { path: `/runs/${complete.runId}`, body: { data: complete } },
    ]);
    setMockSearchParams({ run: complete.runId });
    renderWithTheme(<InspectorClient />);
    await advance(0);

    expect(screen.queryByText('following')).toBeNull();
    expect(screen.queryByRole('button', { name: /Jump to latest/ })).toBeNull();
    const total = within(rail()).getAllByRole('button').length;
    expect(screen.getByText(`${total} of ${total} actions shown`)).toBeTruthy();

    // Hiding a group hides its rows and says so, rather than silently shrinking.
    fireEvent.click(screen.getByLabelText('exchanges'));
    const shown = within(rail()).getAllByRole('button').length;
    expect(shown).toBeLessThan(total);
    expect(screen.getByText(`${shown} of ${total} actions shown`)).toBeTruthy();
  });

  it('[QLU-12] reads an orchestration as its steps, with each child run nested under one', async () => {
    const orchestration = makeOrchestration();
    const children = ORCHESTRATION_CHILD_IDS.map((runId) => ({ ...makeRun(), runId }));
    stubApi([
      RUNS,
      PIPELINES,
      {
        path: '/orchestrations',
        body: { data: [orchestration], meta: { total: 1, limit: 30, offset: 0 } },
      },
      {
        path: `/orchestrations/${orchestration.orchestrationRunId}`,
        body: { data: orchestration },
      },
      ...children.map((child) => ({ path: `/runs/${child.runId}`, body: { data: child } })),
    ]);
    setMockSearchParams({ orchestration: orchestration.orchestrationRunId });
    renderWithTheme(<InspectorClient />);
    await advance(0);
    await advance(0);

    const labels = within(rail())
      .getAllByRole('button')
      .map((row) => row.textContent ?? '');
    expect(labels[0]).toContain('Orchestration opened — calibration → system-design');
    expect(labels.some((label) => label.includes('Step panel completed'))).toBe(true);
    expect(labels.some((label) => label.includes('Step reconcile completed'))).toBe(true);
    // Each child's own actions are nested under the step that opened it, and
    // carry that step in their scope.
    const nested = within(rail())
      .getAllByRole('button')
      .filter((row) => (row.textContent ?? '').includes('step panel'));
    expect(nested.length).toBeGreaterThan(children.length);
    expect(labels.some((label) => label.includes('Run opened — system-design'))).toBe(true);
  });

  it('[QLU-12] the steps panel draws the block the record names and says the graph is partial', async () => {
    const base = makeOrchestration();
    const orchestration = makeOrchestration({
      status: 'failed',
      steps: {
        panel: {
          ...base.steps['panel'],
          status: 'failed',
          reason: 'run-failed',
          note: 'a sample threw',
        },
        reconcile: {
          ...base.steps['reconcile'],
          status: 'skipped',
          reason: 'upstream-failed',
          note: 'panel',
          report: null,
        },
      },
    });
    stubApi([
      RUNS,
      PIPELINES,
      {
        path: '/orchestrations',
        body: { data: [orchestration], meta: { total: 1, limit: 30, offset: 0 } },
      },
      {
        path: `/orchestrations/${orchestration.orchestrationRunId}`,
        body: { data: orchestration },
      },
      ...ORCHESTRATION_CHILD_IDS.map((runId) => ({
        path: `/runs/${runId}`,
        body: { data: { ...makeRun(), runId } },
      })),
    ]);
    setMockSearchParams({ orchestration: orchestration.orchestrationRunId });
    renderWithTheme(<InspectorClient />);
    await advance(0);
    await advance(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Steps' }));
    await advance(0);
    const steps = screen.getByRole('region', { name: 'Step reconcile' });
    expect(steps.textContent).toContain('Blocked by');
    expect(steps.textContent).toContain('panel');
    expect(screen.getByRole('region', { name: 'Step panel' }).textContent).toContain(
      'Blocked reconcile',
    );
    // The orchestrator's own dependency declaration is not published, so the
    // panel says what it is drawing rather than implying a whole graph.
    expect(screen.getByText(/only edges drawn are blocks the record names/)).toBeTruthy();
  });

  it('[QLU-5] with no run named, it asks for one rather than guessing', async () => {
    stubApi([RUNS, PIPELINES, ORCHESTRATIONS]);
    setMockSearchParams({});
    renderWithTheme(<InspectorClient />);
    await advance(0);
    expect(screen.getByRole('status').textContent).toContain('Select a run or an orchestration');
    expect(screen.getByRole('table', { name: 'Runs to inspect' })).toBeTruthy();
  });
});
