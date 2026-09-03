import type { EntityManager } from '@mikro-orm/postgresql';
import { EvalJob } from '@sysdesign/db';
import { describe, expect, it, vi } from 'vitest';

import { lockHeartbeat } from './lock-heartbeat';

/** An entity manager that records every native update it is asked for. */
function fakeEm(outcome: 'ok' | 'throw' = 'ok') {
  const updates: Array<{ entity: unknown; where: unknown; data: unknown }> = [];
  const nativeUpdate = vi.fn((entity: unknown, where: unknown, data: unknown) => {
    updates.push({ entity, where, data });
    return outcome === 'ok' ? Promise.resolve(1) : Promise.reject(new Error('connection lost'));
  });
  const em = { fork: () => ({ nativeUpdate }) } as unknown as EntityManager;
  return { em, updates };
}

const job = { id: 'job-1', lockedBy: 'eval-worker-42' };
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('lockHeartbeat', () => {
  it('[EVAL-18] refreshes the lock at every pass boundary, fenced by the worker that holds it', async () => {
    const { em, updates } = fakeEm();
    const recorder = lockHeartbeat(em, job, { warn: () => undefined });

    recorder.beginPass('rules.core', 'deterministic', {});
    recorder.endPass('rules.core', [], 3);
    recorder.beginPass('llm.critic', 'llm', {});
    await flush();

    expect(updates).toHaveLength(3);
    for (const update of updates) {
      expect(update.entity).toBe(EvalJob);
      // The fence: a job the reaper handed to another worker matches nothing.
      expect(update.where).toEqual({ id: 'job-1', status: 'running', lockedBy: 'eval-worker-42' });
      expect((update.data as { lockedAt: Date }).lockedAt).toBeInstanceOf(Date);
    }
  });

  it('is best-effort: a failed refresh is logged and never reaches the evaluation', async () => {
    const { em } = fakeEm('throw');
    const warn = vi.fn();
    const recorder = lockHeartbeat(em, job, { warn });

    expect(() => recorder.beginPass('llm.critic', 'llm', {})).not.toThrow();
    await flush();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('job-1');
    expect(warn.mock.calls[0]?.[0]).toContain('connection lost');
  });
});
