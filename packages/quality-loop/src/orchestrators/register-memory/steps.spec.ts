import type { QualityRunDto, StartOrchestrationRequest } from '@sysdesign/contracts';
import { DEFAULT_QUALITY_RUN_ITERATIONS, registerDigestReportSchema } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { toRunDto, type RunRecord } from '../../core/contracts';
import type { RunInput } from '../../core/loop/run-pipeline';
import { registerDigestGoal, sampleRegisterDigest } from '../../pipelines/register-digest/testing';
import { childRun } from '../memory/steps.testing';
import { fakeStepContext } from '../runner/testing';
import { digest, type RegisterMemoryOutputs } from './steps';
import { ACCEPT_AT, digestTrace } from './testing';

const GOAL = registerDigestGoal();

/** A context for the step: `execute` answers with the canned child, recording what it was handed. */
function ctx(
  answer: RunRecord | null,
  request: StartOrchestrationRequest = { goal: GOAL, maxIterations: 2 },
  acceptAt: number | null = ACCEPT_AT,
) {
  const executed: RunInput[] = [];
  const execute = (input: RunInput): Promise<QualityRunDto> => {
    executed.push(input);
    if (!answer) throw new Error('no child run was expected');
    return Promise.resolve(toRunDto(answer));
  };
  return {
    executed,
    ...fakeStepContext<RegisterMemoryOutputs, unknown>(undefined, execute, {
      request,
      pipelines: ['register-digest'],
      acceptAtOf: () => acceptAt,
    }),
  };
}

const child = (trace = digestTrace(), failed = false): RunRecord =>
  childRun('register-digest', trace, failed);

describe('the register-memory digest step', () => {
  it('[QL-78] runs the pipeline over the goal alone, under the request’s budget or else the default, and reports what it read in the shape the step declares', async () => {
    const budgeted = ctx(child());
    const result = await digest(budgeted);
    expect(budgeted.executed).toEqual([{ goal: GOAL, maxIterations: 2 }]);
    expect(result).toMatchObject({
      status: 'complete',
      reason: null,
      note: null,
      counts: { memories: 3, endorsed: 3, withheld: 0 },
      report: { admission: 'admitted', endorsed: ['memory.1', 'memory.2', 'memory.3'] },
    });
    expect(registerDigestReportSchema.safeParse(result.report).success).toBe(true);
    // Nothing later consumes it: the host reads the report.
    expect(result.output).toBeUndefined();

    // A request that names no budget runs under the one the service records for it.
    const unbudgeted = ctx(child(), { goal: GOAL });
    await digest(unbudgeted);
    expect(unbudgeted.executed).toEqual([
      { goal: GOAL, maxIterations: DEFAULT_QUALITY_RUN_ITERATIONS },
    ]);

    // Past the refusal, still nothing but the goal and the budget reaches the child.
    const handedIn = ctx(child(), {
      goal: GOAL,
      output: sampleRegisterDigest(),
      criteria: [{ id: 'c1', kind: 'grounding', statement: 'Anything goes.' }],
    });
    await digest(handedIn);
    expect(handedIn.executed).toEqual([
      { goal: GOAL, maxIterations: DEFAULT_QUALITY_RUN_ITERATIONS },
    ]);
  });

  it('[QL-78] a digest it may not draw on completes with its reason, its note and a report endorsing nothing', async () => {
    const result = await digest(
      ctx(child(digestTrace({ lenses: { 'critic.grounding': 'lost' } }))),
    );
    expect(result).toMatchObject({
      status: 'complete',
      reason: 'judges-lost',
      note: 'lost every sample: critic.grounding',
      counts: { memories: 3, endorsed: 0, withheld: 0 },
      report: { admission: 'admitted', endorsed: [] },
    });
    expect(registerDigestReportSchema.safeParse(result.report).success).toBe(true);
  });

  it('[QL-78] a child that did not complete fails the step with no report, and a pipeline the registry does not hold skips it before any run', async () => {
    const failed = await digest(ctx(child(digestTrace(), true)));
    expect(failed).toEqual({ status: 'failed', reason: 'run-failed', note: 'the model went away' });

    const unregistered = ctx(null, undefined, null);
    expect(await digest(unregistered)).toMatchObject({
      status: 'skipped',
      reason: 'pipeline-unavailable',
      note: 'register-digest',
    });
    expect(unregistered.executed).toEqual([]);
  });
});
