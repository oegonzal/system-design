import type { LlmClient } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { noQueryProbes } from '../../../orchestrators/memory/steps.testing';
import { LlmQueryProbes } from './llm-query-probes';

const client = (completeStructured: LlmClient['completeStructured']): LlmClient => ({
  model: 'fake',
  completeStructured,
});

describe('deriving what to search under', () => {
  it('never lets a probe failure cost the recall, whatever the client does', async () => {
    const refused = new LlmQueryProbes(client(() => Promise.resolve(null)));
    const threw = new LlmQueryProbes(
      client(() => Promise.reject(new Error('rate limited'))),
      () => undefined,
    );

    expect(await refused.derive('a goal')).toEqual([]);
    expect(await threw.derive('a goal')).toEqual([]);
    expect(await noQueryProbes.derive('a goal')).toEqual([]);
  });

  it('passes the goal as the task and the conditions back', async () => {
    const seen: string[] = [];
    const probes = new LlmQueryProbes(
      client((request) => {
        seen.push(request.user);
        return Promise.resolve({
          probes: ['a p99 target crosses a hop you do not control'],
        } as never);
      }),
    );

    expect(await probes.derive('# Prompt')).toEqual([
      'a p99 target crosses a hop you do not control',
    ]);
    expect(seen).toEqual(['# Prompt']);
  });
});
