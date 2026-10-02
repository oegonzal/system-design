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

import { makePipeline, makeRun, makeTwoIterationRun, RUN_SUMMARIES } from '../../testing/fixtures';
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
    stubApi([RUNS, PIPELINES, { path: `/runs/${complete.runId}`, body: { data: complete } }]);
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
    stubApi([RUNS, PIPELINES, { path: `/runs/${complete.runId}`, body: { data: complete } }]);
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

  it('[QLU-5] with no run named, it asks for one rather than guessing', async () => {
    stubApi([RUNS, PIPELINES]);
    setMockSearchParams({});
    renderWithTheme(<InspectorClient />);
    await advance(0);
    expect(screen.getByRole('status').textContent).toContain('Select a run above');
    expect(screen.getByRole('table', { name: 'Runs to inspect' })).toBeTruthy();
  });
});
