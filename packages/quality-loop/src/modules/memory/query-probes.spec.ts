import type { LlmClient } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { probesOf, probeTexts, queryText } from './compose';
import { LlmQueryProbes, MAX_PROBES, noQueryProbes } from './query-probes';

const client = (
  completeStructured: LlmClient['completeStructured'],
  enabled = true,
): LlmClient => ({ enabled, model: 'fake', completeStructured });

describe('deriving what to search under', () => {
  it('never lets a probe failure cost the recall, whatever the client does', async () => {
    const refused = new LlmQueryProbes(client(() => Promise.resolve(null)));
    const threw = new LlmQueryProbes(
      client(() => Promise.reject(new Error('rate limited'))),
      () => undefined,
    );
    const off = new LlmQueryProbes(client(() => Promise.resolve(null), false));

    expect(await refused.derive('a goal')).toEqual([]);
    expect(await threw.derive('a goal')).toEqual([]);
    expect(await off.derive('a goal')).toEqual([]);
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

describe('the probe set a recall searches under', () => {
  const GOAL = '# Prompt — serve an order history';

  it('puts the goal first, so the fused list can only add to a bare search', () => {
    expect(probeTexts(GOAL, ['a latency budget crosses a vendor hop'])).toEqual([
      queryText(GOAL),
      'a latency budget crosses a vendor hop',
    ]);
    expect(probeTexts(GOAL, [])).toEqual([queryText(GOAL)]);
  });

  it('drops blanks and repeats, because one empty probe nulls the whole batch', () => {
    const texts = probeTexts(GOAL, ['  ', '', 'a condition', 'a condition', '  a condition  ']);
    expect(texts).toEqual([queryText(GOAL), 'a condition']);
  });

  it('is bounded exactly, not greedily', () => {
    const many = Array.from({ length: MAX_PROBES * 3 }, (_, index) => `condition ${index}`);
    expect(probeTexts(GOAL, many)).toHaveLength(MAX_PROBES + 1);
  });

  it('asks every named vector, and lets the goal keep the budget the others share', () => {
    const vectors = [[1], [2], [3]];
    const probes = probesOf(vectors, 16);

    expect(probes).toHaveLength(6);
    expect(probes.map((probe) => probe.using)).toEqual([
      'condition',
      'lesson',
      'condition',
      'lesson',
      'condition',
      'lesson',
    ]);
    expect(probes.slice(0, 2).map((probe) => probe.limit)).toEqual([16, 16]);
    // The derived probes share the budget, so widening does not multiply the payload.
    expect(probes.slice(2).map((probe) => probe.limit)).toEqual([6, 6, 6, 6]);
  });
});
