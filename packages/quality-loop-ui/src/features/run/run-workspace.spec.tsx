import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makePipeline, makePromptDocument, makeRun, PROMPT_ENTRIES } from '../../testing/fixtures';
import { RunWorkspace } from './run-workspace';

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
    expect(screen.getByText('running')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(1 + 1);
    expect(screen.getByText(/1 model exchange so far/)).toBeTruthy();

    await advance(1200);
    expect(screen.getAllByRole('row')).toHaveLength(1 + 2);

    await advance(1200);
    expect(screen.getByText('complete')).toBeTruthy();
    expect(screen.getByText(/Run complete — revise/)).toBeTruthy();
    expect(screen.getByText(/stopped: max-iterations/)).toBeTruthy();

    const polls = calls.filter((call) => call.url === `/runs/${complete.runId}`).length;
    await advance(1200 * 4);
    expect(calls.filter((call) => call.url === `/runs/${complete.runId}`).length).toBe(polls);
  });

  it('[QLU-2] a failed run says so and the controls come back', async () => {
    stubApi([
      { path: '/prompts', body: { data: PROMPT_ENTRIES.slice(1) } },
      { path: '/pipelines', body: { data: [makePipeline()] } },
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

    expect(screen.getByText('failed')).toBeTruthy();
    expect(screen.getByText('Run problem: the producer exploded')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('reports a library that cannot be loaded instead of an empty form', async () => {
    stubApi([
      { path: '/prompts', status: 500, body: { statusCode: 500, message: 'library on fire' } },
      { path: '/pipelines', body: { data: [] } },
    ]);

    renderWithTheme(<RunWorkspace />);
    await advance(0);
    await advance(0);

    expect(screen.getByText('library on fire')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });
});
