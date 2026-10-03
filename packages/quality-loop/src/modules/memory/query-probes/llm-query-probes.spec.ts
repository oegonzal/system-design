import { CUT_MARKER, keptAtMost } from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { fakeLlm } from '../../../core/testing';
import { buildQuery, probeSet, queryText } from '../../../orchestrators/memory/recall/query';
import { noQueryProbes } from '../../../orchestrators/memory/steps.testing';
import { fused, GOAL, hitOf } from '../../../orchestrators/memory/testing';
import { FOCUS_HEADING, MAX_PROBES, PROBE_BOUND } from '../../../pipelines/memory-recall/input';
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

  it('[QL-34] shows what is wrong now after the goal, as its own section under the heading the curator reads', async () => {
    const seen: string[] = [];
    const probes = new LlmQueryProbes(
      client((request) => {
        seen.push(request.user);
        return Promise.resolve({ probes: [] } as never);
      }),
    );

    await probes.derive('# Prompt\n', [
      'unhandled failure (high): no fallback for a cache outage',
      'c1 fail: Redirect within 50 ms at p99.',
    ]);
    await probes.derive('# Prompt', []);
    expect(seen).toEqual([
      [
        '# Prompt',
        '',
        FOCUS_HEADING,
        '',
        '- unhandled failure (high): no fallback for a cache outage',
        '- c1 fail: Redirect within 50 ms at p99.',
      ].join('\n'),
      '# Prompt',
    ]);
  });

  it("[QL-41] a probe written past its bound is kept, a list past six is cut by whole items, and the curator's query lists each probe as it was read", async () => {
    const words = (length: number): string =>
      'a condition '
        .repeat(Math.ceil(length / 12))
        .slice(0, length)
        .trim();
    const over = words(PROBE_BOUND.ceiling + 60);
    const extreme = words(keptAtMost(PROBE_BOUND) * 2);
    const written = [
      over,
      extreme,
      ...Array.from({ length: MAX_PROBES }, (_, i) => `condition ${i}`),
    ];
    const derived = await new LlmQueryProbes(fakeLlm({ probes: written })).derive(GOAL);

    // The list is cut to six from its end; the long probe is whole, the extreme one cut at a word, marked.
    expect(derived).toHaveLength(MAX_PROBES);
    expect(derived.slice(2)).toEqual(written.slice(2, MAX_PROBES));
    expect(derived[0]).toBe(over);
    expect(derived[1].endsWith(CUT_MARKER)).toBe(true);
    expect(derived[1].length).toBeLessThanOrEqual(keptAtMost(PROBE_BOUND));

    // What the read returned is what the curator is shown: never refused, never cut again.
    const built = buildQuery(
      queryText(GOAL),
      probeSet(GOAL, derived),
      fused([hitOf('serve the list from a store the page owns', 'run-a', 'memory.1')]),
    );
    expect(built.issues).toEqual([]);
    expect(built.query?.probes).toEqual(derived);
  });
});
