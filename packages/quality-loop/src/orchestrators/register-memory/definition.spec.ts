import type { PipelineSummary, StartOrchestrationRequest } from '@sysdesign/contracts';
import {
  ORCHESTRATION_REASONS,
  REGISTER_MEMORY_STEP_REASONS,
  registerDigestReportSchema,
  renderDocumentGoal,
  resumeChunk,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { registerDigestGoal, sampleRegisterDigest } from '../../pipelines/register-digest/testing';
import { UNADMITTED_REASON } from '../common';
import { childRun } from '../memory/steps.testing';
import { validateOrchestrator } from '../runner/definition';
import { orchestrationDeps, performed, summaryOf } from '../runner/testing';
import { REGISTER_MEMORY } from './definition';
import { digestTrace } from './testing';

const GOAL = registerDigestGoal();
const registry: PipelineSummary[] = [summaryOf('register-digest', 75, 'composed')];
/** Why the orchestrator would refuse the request before a row exists; null when it takes it. */
const refusal = (request: StartOrchestrationRequest): string | null =>
  REGISTER_MEMORY.refuse?.(request, registry) ?? null;

describe('the register-memory orchestrator', () => {
  it('[QL-78] is valid data: one digest step over the register-digest pipeline, its report declared in the contract’s shape; it chooses its own pipeline, observes nothing at open, stands in for nothing, and declares every unadmitted reason and none of the runner’s', async () => {
    expect(() => validateOrchestrator(REGISTER_MEMORY as never)).not.toThrow();
    expect(REGISTER_MEMORY.takesTarget).toBe(false);
    expect(REGISTER_MEMORY.steps.map((step) => [step.id, step.pipeline, step.needs])).toEqual([
      ['digest', 'register-digest', undefined],
    ]);
    expect(REGISTER_MEMORY.steps.every((step) => step.provided === undefined)).toBe(true);
    expect(REGISTER_MEMORY.reports).toEqual({ digest: registerDigestReportSchema });
    expect(REGISTER_MEMORY.contextSchema.parse(await REGISTER_MEMORY.context(undefined))).toEqual(
      {},
    );

    expect(REGISTER_MEMORY.reasons).toBe(REGISTER_MEMORY_STEP_REASONS);
    expect(REGISTER_MEMORY.reasons).toEqual(
      expect.arrayContaining(Object.values(UNADMITTED_REASON)),
    );
    expect(
      REGISTER_MEMORY.reasons.filter((reason) =>
        (ORCHESTRATION_REASONS as readonly string[]).includes(reason),
      ),
    ).toEqual([]);
  });

  it('[QL-78] refuses, before a row exists, a goal no register-digest composer rendered, a digest handed in and a rubric handed in — and takes a composed text', () => {
    expect(refusal({ goal: 'Just a prompt.' })).toMatch(/carries no register-digest index/);
    expect(refusal({ goal: renderDocumentGoal(resumeChunk()) })).toMatch(
      /carries no register-digest index/,
    );
    expect(refusal({ goal: GOAL, output: sampleRegisterDigest() })).toMatch(
      /a digest handed in is refused/,
    );
    expect(
      refusal({
        goal: GOAL,
        criteria: [{ id: 'c1', kind: 'capture', statement: 'Captures anything at all.' }],
      }),
    ).toMatch(/a rubric handed in is refused/);
    expect(refusal({ goal: GOAL })).toBeNull();
    expect(refusal({ goal: GOAL, maxIterations: 2 })).toBeNull();
  });

  it('[QL-78] run over the runner, a composed text is digested once and its step recorded with the child, the counts and a report the declared shape holds', async () => {
    const asked: { pipeline: string; goal: string; maxIterations: number | undefined }[] = [];
    const deps = orchestrationDeps(
      undefined,
      (request, onOpened) => {
        asked.push({
          pipeline: request.pipeline,
          goal: request.goal,
          maxIterations: request.maxIterations,
        });
        const run = childRun('register-digest', digestTrace());
        onOpened?.(run);
        return Promise.resolve(run);
      },
      { pipelines: () => registry },
    );
    const record = await performed(REGISTER_MEMORY, { goal: GOAL, maxIterations: 2 }, deps);

    expect(asked).toEqual([{ pipeline: 'register-digest', goal: GOAL, maxIterations: 2 }]);
    expect(record.status).toBe('complete');
    expect(record.pipeline).toBeNull();
    expect(record.steps['digest']).toMatchObject({
      status: 'complete',
      reason: null,
      runIds: ['register-digest-run'],
      counts: { memories: 3, endorsed: 3, withheld: 0 },
      report: { admission: 'admitted', endorsed: ['memory.1', 'memory.2', 'memory.3'] },
    });
  });
});
