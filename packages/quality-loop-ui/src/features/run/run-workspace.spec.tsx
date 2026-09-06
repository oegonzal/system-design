import type * as WebTesting from '@sysdesign/web-testing';
import {
  renderWithTheme,
  resetNavigationMock,
  routerMock,
  setMockSearchParams,
  stubApi,
  type StubRoute,
} from '@sysdesign/web-testing';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  makePipeline,
  makePromptDocument,
  makeRun,
  PROMPT_ENTRIES,
  RUN_SUMMARIES,
} from '../../testing/fixtures';
import { RunWorkspace } from './run-workspace';

// `importActual` rather than `import()`: the factory is hoisted above the
// static imports, and a dynamic import would make Nx read the harness as a
// lazy-loaded library and reject the static imports above.
vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

const RECENT: StubRoute = {
  path: '/runs',
  body: { data: RUN_SUMMARIES, meta: { total: 3, limit: 20, offset: 0 } },
};

const complete = makeRun();
const running = (exchangeCount: number) =>
  makeRun({
    status: 'running',
    finishedAt: null,
    trace: null,
    exchanges: complete.exchanges.slice(0, exchangeCount),
  });

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

describe('RunWorkspace', () => {
  it('[QLU-1] [QLU-2] lists the library, starts a run from the chosen prompt, follows it to the verdict', async () => {
    const bodies: unknown[] = [];
    const { calls } = stubApi([
      { path: '/prompts', body: { data: PROMPT_ENTRIES } },
      { path: '/pipelines', body: { data: [makePipeline()] } },
      RECENT,
      {
        path: '/prompts/notification-fanout',
        body: {
          data: {
            ...makePromptDocument(),
            id: 'notification-fanout',
            title: 'Fan out',
            markdown: '# Fan out\n',
          },
        },
      },
      { path: '/prompts/order-history', body: { data: makePromptDocument() } },
      {
        method: 'POST',
        path: '/runs',
        handler: ({ init }) => {
          bodies.push(JSON.parse(String(init?.body)));
          return { status: 202, body: { data: { runId: complete.runId, status: 'running' } } };
        },
      },
      {
        path: `/runs/${complete.runId}`,
        sequence: [{ data: running(1) }, { data: running(2) }, { data: complete }],
      },
    ]);

    renderWithTheme(<RunWorkspace />);
    await advance(0);
    await advance(0);

    const promptSelect = screen.getByLabelText('Prompt') as HTMLSelectElement;
    expect([...promptSelect.options].map((option) => option.value)).toEqual([
      'notification-fanout',
      'order-history',
    ]);
    expect((screen.getByLabelText('Pipeline') as HTMLSelectElement).value).toBe('system-design');
    expect((screen.getByLabelText('Iterations') as HTMLInputElement).value).toBe('1');
    expect(screen.getByLabelText('Fan out').textContent).toBe('# Fan out\n');

    fireEvent.change(promptSelect, { target: { value: 'order-history' } });
    await advance(0);
    expect(screen.getByLabelText(/Unify online and in-store orders/).textContent).toContain(
      '## Scenario',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await advance(0);
    expect(bodies).toEqual([
      { pipeline: 'system-design', goal: makePromptDocument().markdown, maxIterations: 1 },
    ]);

    await advance(0);
    const progress = () => within(screen.getByRole('region', { name: 'Run progress' }));
    expect(progress().getByText('running')).toBeTruthy();
    expect(progress().getAllByRole('row')).toHaveLength(1 + 1);
    expect(screen.getByText(/1 model exchange so far/)).toBeTruthy();

    await advance(1200);
    expect(progress().getAllByRole('row')).toHaveLength(1 + 2);

    await advance(1200);
    expect(progress().getByText('complete')).toBeTruthy();
    expect(screen.getByText(/Run complete — revise/)).toBeTruthy();
    expect(screen.getByText(/stopped: max-iterations/)).toBeTruthy();

    const polls = calls.filter((call) => call.url === `/runs/${complete.runId}`).length;
    await advance(1200 * 4);
    expect(calls.filter((call) => call.url === `/runs/${complete.runId}`).length).toBe(polls);

    // [QLU-4] the list is read on mount and again once the run ended; the URL follows the run.
    expect(
      calls.filter((call) => call.method === 'GET' && call.url.startsWith('/runs?')),
    ).toHaveLength(2);
    expect(routerMock.replace).toHaveBeenCalledWith(`?run=${encodeURIComponent(complete.runId)}`);
    expect(screen.getByRole('table', { name: 'Recent runs' })).toBeTruthy();
  });

  it('[QLU-4] reopens a run from ?run=<id> without starting one', async () => {
    setMockSearchParams({ run: complete.runId });
    const { calls } = stubApi([
      { path: '/prompts', body: { data: PROMPT_ENTRIES } },
      { path: '/pipelines', body: { data: [makePipeline()] } },
      RECENT,
      { path: '/prompts/notification-fanout', body: { data: makePromptDocument() } },
      { path: `/runs/${complete.runId}`, body: { data: complete } },
    ]);

    renderWithTheme(<RunWorkspace />);
    await advance(0);
    await advance(0);

    expect(screen.getByText(/Run complete — revise/)).toBeTruthy();
    expect(screen.getByText(/stopped: max-iterations/)).toBeTruthy();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('[QLU-4] a click on a recent run follows it and updates the URL', async () => {
    const accepted = RUN_SUMMARIES[2];
    if (!accepted) throw new Error('fixture has no accepted run');
    const { calls } = stubApi([
      { path: '/prompts', body: { data: PROMPT_ENTRIES } },
      { path: '/pipelines', body: { data: [makePipeline()] } },
      RECENT,
      { path: '/prompts/notification-fanout', body: { data: makePromptDocument() } },
      { path: `/runs/${accepted.runId}`, body: { data: makeRun({ runId: accepted.runId }) } },
    ]);

    renderWithTheme(<RunWorkspace />);
    await advance(0);
    await advance(0);

    const table = within(screen.getByRole('table', { name: 'Recent runs' }));
    fireEvent.click(table.getAllByRole('button')[2] as HTMLElement);
    await advance(0);

    expect(calls.some((call) => call.url === `/runs/${accepted.runId}`)).toBe(true);
    expect(routerMock.replace).toHaveBeenCalledWith(`?run=${encodeURIComponent(accepted.runId)}`);
    expect(table.getAllByRole('button')[2]?.getAttribute('aria-current')).toBe('true');
  });

  it('[QLU-2] a failed run says so and the controls come back', async () => {
    stubApi([
      { path: '/prompts', body: { data: PROMPT_ENTRIES.slice(1) } },
      { path: '/pipelines', body: { data: [makePipeline()] } },
      RECENT,
      { path: '/prompts/order-history', body: { data: makePromptDocument() } },
      {
        method: 'POST',
        path: '/runs',
        status: 202,
        body: { data: { runId: 'r-fail', status: 'running' } },
      },
      {
        path: '/runs/r-fail',
        body: {
          data: makeRun({
            runId: 'r-fail',
            status: 'failed',
            trace: null,
            error: { name: 'Error', message: 'the producer exploded', stack: null },
          }),
        },
      },
    ]);

    renderWithTheme(<RunWorkspace />);
    await advance(0);
    await advance(0);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await advance(0);
    await advance(0);

    expect(
      within(screen.getByRole('region', { name: 'Run progress' })).getByText('failed'),
    ).toBeTruthy();
    expect(screen.getByText('Run problem: the producer exploded')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('reports a library that cannot be loaded instead of an empty form', async () => {
    stubApi([
      { path: '/prompts', status: 500, body: { statusCode: 500, message: 'library on fire' } },
      { path: '/pipelines', body: { data: [] } },
      RECENT,
    ]);

    renderWithTheme(<RunWorkspace />);
    await advance(0);
    await advance(0);

    expect(screen.getByText('library on fire')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });
});
