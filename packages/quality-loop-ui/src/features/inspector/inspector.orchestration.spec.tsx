import type * as WebTesting from '@sysdesign/web-testing';
import {
  renderWithTheme,
  resetNavigationMock,
  setMockSearchParams,
  stubApi,
} from '@sysdesign/web-testing';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeOrchestration, makeRun, ORCHESTRATION_CHILD_IDS } from '../../testing/fixtures';
import { InspectorClient } from './inspector.client';
import { advance, PIPELINES, rail, RUNS } from './testing';

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

describe('InspectorClient', () => {
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

  it('[QLU-12] moving to another orchestration starts a new log, not a continuation of the last', async () => {
    // Moving between orchestrations never passes through "nothing selected", so a
    // flag that only reset on nothing left the new one's actions appended to the
    // old one's: the rail kept both, the provenance count described two runs
    // glued together, and the first new action was diffed against the previous
    // orchestration's final state — a transition that never happened.
    const first = makeOrchestration();
    const second = makeOrchestration({
      orchestrationRunId: '11111111-2222-3333-4444-555555555555',
      orchestrator: 'second-opinion',
      finishedAt: '2026-09-06T00:20:00.000Z',
    });
    stubApi([
      RUNS,
      PIPELINES,
      {
        path: '/orchestrations',
        body: { data: [first, second], meta: { total: 2, limit: 30, offset: 0 } },
      },
      { path: `/orchestrations/${first.orchestrationRunId}`, body: { data: first } },
      { path: `/orchestrations/${second.orchestrationRunId}`, body: { data: second } },
      ...ORCHESTRATION_CHILD_IDS.map((runId) => ({
        path: `/runs/${runId}`,
        body: { data: { ...makeRun(), runId } },
      })),
    ]);

    setMockSearchParams({ orchestration: first.orchestrationRunId });
    const { rerender } = renderWithTheme(<InspectorClient />);
    await advance(0);
    await advance(0);
    const firstRows = within(rail()).getAllByRole('button').length;
    expect(firstRows).toBeGreaterThan(3);

    setMockSearchParams({ orchestration: second.orchestrationRunId });
    await act(async () => {
      rerender(<InspectorClient />);
    });
    await advance(0);
    await advance(0);

    const rows = within(rail()).getAllByRole('button');
    const labels = rows.map((row) => row.textContent ?? '');
    // Nothing from the orchestration no longer named in the URL survives.
    expect(labels.some((label) => label.includes('second-opinion'))).toBe(true);
    expect(labels.some((label) => label.includes('calibration'))).toBe(false);
    expect(labels[0]).toContain('Orchestration opened');
    // And the log is read as one snapshot again, not as a continuation.
    expect(screen.getByRole('status').textContent).toContain('read back out of one recorded');
  });
});
