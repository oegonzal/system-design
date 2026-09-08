import { describe, expect, it, vi } from 'vitest';

import { closeSteps, StepLedger } from './steps';
import { memoryRecord, pendingStep } from './steps.testing';

describe('the step ledger', () => {
  it('[QL-16] closeSteps fails what was running and skips what was pending, both with one reason', () => {
    const steps = memoryRecord().steps;
    steps.recall = { ...steps.recall, status: 'complete' };
    steps.target = { ...steps.target, status: 'running' };
    const closed = closeSteps(steps, 'errored', 'boom', 'now');
    expect(closed.recall.status).toBe('complete');
    expect(closed.target).toMatchObject({
      status: 'failed',
      reason: 'errored',
      note: 'boom',
      finishedAt: 'now',
    });
    expect(closed.digest).toMatchObject({
      status: 'skipped',
      reason: 'errored',
      note: null,
      finishedAt: 'now',
    });
    expect(closed.store).toMatchObject({ status: 'skipped', reason: 'errored' });
  });

  it('[QL-16] the ledger flushes in order and logs a failed flush instead of throwing', async () => {
    const flushed: string[] = [];
    let fail = true;
    const warn = vi.fn();
    const ledger = new StepLedger(
      memoryRecord(),
      async (current) => {
        if (fail) {
          fail = false;
          throw new Error('pool gone');
        }
        flushed.push(current.steps.recall.status);
      },
      () => 'now',
      warn,
    );
    await ledger.begin('recall');
    await ledger.child('recall', 'r-1');
    await ledger.end('recall', { status: 'complete' });
    await ledger.settled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pool gone'));
    expect(flushed).toEqual(['running', 'complete']);
    expect(ledger.record.steps.recall).toMatchObject({ status: 'complete', runId: 'r-1' });
  });
});
