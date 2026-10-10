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

import {
  makeOrchestration,
  makePipeline,
  makeRun,
  makeRunSummary,
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

/** A table's rows as cells by column name, so a column's position is not this spec's business. */
const cellsOf = (table: HTMLElement): Record<string, string>[] => {
  const headers = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent ?? '');
  return [...table.querySelectorAll('tbody tr')].map((row) =>
    Object.fromEntries(
      [...row.querySelectorAll('td')].map((cell, at) => [headers[at], cell.textContent ?? '']),
    ),
  );
};

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

  it('[QLU-13] the model calls are the run’s own log, reachable from anywhere in the rail', async () => {
    stubApi([
      RUNS,
      PIPELINES,
      ORCHESTRATIONS,
      { path: `/runs/${complete.runId}`, body: { data: complete } },
      { path: `/runs/${complete.runId}/dump`, body: { data: [] } },
    ]);
    setMockSearchParams({ run: complete.runId });
    const { rerender } = renderWithTheme(<InspectorClient />);
    await advance(0);

    // Select the FIRST action. The call actions land at the tail of the log, so a
    // panel filtered to the selected action would be empty here — and a reader
    // could reach a prompt only from the end. A call's ordinal counts attempts,
    // so it cannot be placed in the loop's order at all; the honest reading is
    // the whole run's calls, wherever the rail sits.
    const first = within(rail()).getAllByRole('button')[0];
    fireEvent.click(first);
    setMockSearchParams({ run: complete.runId, action: lastSelectedKey() ?? '' });
    await act(async () => {
      rerender(<InspectorClient />);
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Model calls' }));
    await advance(0);
    const table = screen.getByRole('table', { name: 'Model calls' });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(complete.exchanges.length);
    expect(screen.getByText(/wherever you are in the rail/)).toBeTruthy();
  });

  it('[QLU-13] opens the prompt that produced a named finding, read out of the dump', async () => {
    const PROMPT = '# Goal\n\nThe worker polls every five minutes.';
    stubApi([
      RUNS,
      PIPELINES,
      ORCHESTRATIONS,
      { path: `/runs/${complete.runId}`, body: { data: complete } },
      {
        path: `/runs/${complete.runId}/dump`,
        body: {
          data: [
            { path: 'manifest.json', bytes: 100 },
            { path: '05-llm/03.critic.requirements.s1.1.system.txt', bytes: 900 },
            { path: '05-llm/03.critic.requirements.s1.1.user.txt', bytes: 4200 },
            { path: '05-llm/03.critic.requirements.s1.1.response.json', bytes: 1800 },
          ],
        },
      },
      {
        path: '/runs/' + complete.runId + '/dump/05-llm/03.critic.requirements.s1.1.user.txt',
        body: {
          data: {
            path: '05-llm/03.critic.requirements.s1.1.user.txt',
            bytes: 4200,
            text: PROMPT,
            problem: null,
          },
        },
      },
    ]);
    setMockSearchParams({ run: complete.runId });
    renderWithTheme(<InspectorClient />);
    await advance(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Model calls' }));
    await advance(0);
    // The call that produced the finding — the critic's own sample.
    fireEvent.click(screen.getByRole('button', { name: 'critic.requirements.s1' }));
    await advance(0);

    const files = screen.getByRole('table', { name: 'Files for critic.requirements.s1' });
    expect([...files.querySelectorAll('tbody tr')].map((row) => row.textContent)).toEqual([
      expect.stringContaining('system prompt'),
      expect.stringContaining('user prompt'),
      expect.stringContaining('raw reply'),
    ]);
    // The manifest is not this call's file, and neither is any other scope's.
    expect(files.textContent).not.toContain('manifest.json');

    fireEvent.click(
      screen.getByRole('button', { name: '05-llm/03.critic.requirements.s1.1.user.txt' }),
    );
    await advance(0);
    // The bytes exactly as the loop wrote them, which is the whole point.
    expect(screen.getAllByText(/The worker polls every five minutes/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('05-llm/03.critic.requirements.s1.1.user.txt').textContent).toBe(
      PROMPT,
    );
  });

  it('[QLU-13] a run with no dump says so where the transcript would be, and nothing else breaks', async () => {
    stubApi([
      RUNS,
      PIPELINES,
      ORCHESTRATIONS,
      { path: `/runs/${complete.runId}`, body: { data: complete } },
      {
        path: `/runs/${complete.runId}/dump`,
        status: 404,
        body: { message: 'no dump recorded for run x' },
      },
    ]);
    setMockSearchParams({ run: complete.runId });
    renderWithTheme(<InspectorClient />);
    await advance(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Model calls' }));
    await advance(0);
    fireEvent.click(screen.getByRole('button', { name: 'criteria' }));
    await advance(0);

    // The listing is still there: a missing dump costs the transcript, not the run.
    expect(screen.getByRole('table', { name: 'Model calls' })).toBeTruthy();
    expect(screen.getByText(/no dump recorded/)).toBeTruthy();
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

  it('[QLU-5] with no run named, it asks for one rather than guessing', async () => {
    stubApi([RUNS, PIPELINES, ORCHESTRATIONS]);
    setMockSearchParams({});
    renderWithTheme(<InspectorClient />);
    await advance(0);
    expect(screen.getByRole('status').textContent).toContain('Select a run or an orchestration');
    expect(screen.getByRole('table', { name: 'Runs to inspect' })).toBeTruthy();
  });
});
