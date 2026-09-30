import { describe, expect, it } from 'vitest';

import { closeSteps, pendingStep, settledStep } from './record';

describe('the orchestration record', () => {
  it('[QL-16] closeSteps fails what was running and skips what was pending, both with one reason', () => {
    const steps = {
      a: { ...pendingStep(), status: 'complete' as const },
      b: { ...pendingStep(), status: 'running' as const },
      c: pendingStep(),
    };
    const closed = closeSteps(steps, 'errored', 'boom', 'now');
    expect(closed['a'].status).toBe('complete');
    expect(closed['b']).toMatchObject({
      status: 'failed',
      reason: 'errored',
      note: 'boom',
      finishedAt: 'now',
    });
    expect(closed['c']).toMatchObject({
      status: 'skipped',
      reason: 'errored',
      note: null,
      finishedAt: 'now',
    });
  });

  it('[QL-18] a settled step carries what the result said and nothing it did not', () => {
    expect(
      settledStep({ status: 'skipped', reason: 'provided-run', runIds: ['r'] }, 'now'),
    ).toEqual({
      ...pendingStep(),
      status: 'skipped',
      reason: 'provided-run',
      runIds: ['r'],
      finishedAt: 'now',
    });
    expect(pendingStep().report).toBeNull();
  });
});
