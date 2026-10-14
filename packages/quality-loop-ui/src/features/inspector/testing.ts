import { routerMock } from '@sysdesign/web-testing';
import { act, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { makePipeline, makeRun, makeTwoIterationRun, RUN_SUMMARIES } from '../../testing/fixtures';

/** A run that finished after two iterations; `open` and `partway` are the same run while it ran. */
export const complete = makeTwoIterationRun();
export const open = makeRun({
  runId: complete.runId,
  status: 'running',
  finishedAt: null,
  trace: null,
  exchanges: makeRun().exchanges.slice(0, 2),
});
/** The lists the pickers read: three runs, one pipeline, no orchestrations. */
export const RUNS = {
  path: '/runs',
  body: { data: RUN_SUMMARIES, meta: { total: 3, limit: 30, offset: 0 } },
};
export const PIPELINES = { path: '/pipelines', body: { data: [makePipeline()] } };
export const ORCHESTRATIONS = {
  path: '/orchestrations',
  body: { data: [], meta: { total: 0, limit: 30, offset: 0 } },
};

/** Moves the fake clock and lets what it releases settle. */
export async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** The rail of actions the inspector lists. */
export const rail = () => screen.getByRole('list', { name: 'Actions' });

/** The action key the container last wrote to the URL. */
export const lastSelectedKey = (): string | null =>
  new URL(String(routerMock.replace.mock.calls.at(-1)?.[0]), 'http://localhost').searchParams.get(
    'action',
  );
