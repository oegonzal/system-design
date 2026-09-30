import { describe, expect, it, vi } from 'vitest';

import type { OrchestratorDefinition } from './definition';
import { StepLedger } from './ledger';
import { openRecord } from './record';

const oneStep: OrchestratorDefinition<{ a: string }, undefined> = {
  id: 'tiny',
  version: '0.0.1',
  description: 'one step',
  takesTarget: true,
  reasons: [],
  context: () => Promise.resolve({}),
  steps: [{ id: 'a', run: () => Promise.resolve({ status: 'complete', output: 'a!' }) }],
};

describe('the step ledger', () => {
  it('[QL-16] flushes in order and logs a failed flush instead of throwing', async () => {
    const flushed: string[] = [];
    let fail = true;
    const warn = vi.fn();
    const record = openRecord(oneStep, { pipeline: 'tiny', goal: 'g' }, null, {}, 1, () => 'now');
    const ledger = new StepLedger(
      record,
      async (current) => {
        if (fail) {
          fail = false;
          throw new Error('pool gone');
        }
        flushed.push(current.steps['a'].status);
      },
      () => 'now',
      warn,
    );
    await ledger.begin('a');
    await ledger.child('a', 'r-1');
    await ledger.end('a', { status: 'complete' });
    await ledger.settled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pool gone'));
    expect(flushed).toEqual(['running', 'complete']);
    expect(record.steps['a']).toMatchObject({ status: 'complete', runIds: ['r-1'] });
  });
});
