import type {
  MemoryContextDto,
  QualityRunDto,
  RunTrace,
  SuccessCriterion,
} from '@sysdesign/contracts';
import {
  FIELD_EVIDENCE_HEADING,
  readFieldIndex,
  renderDocumentGoal,
  resumeChunk,
  splitFieldGoal,
} from '@sysdesign/contracts';
import { DisabledEmbeddingClient } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { toRunDto, type RunRecord } from '../../core/contracts';
import {
  InMemoryEmbeddingCache,
  InMemoryMemoryStore,
  mutedEmbeddings,
} from '../../modules/memory/testing';
import {
  ANSWERING_PROSE,
  fieldGoal,
  policyCriteria,
  sampleAnswers,
  sampleFields,
} from '../../pipelines/field-answer/testing';
import { CachedEmbeddings } from '../memory/embeddings';
import type { MemoryPorts } from '../memory/ports';
import { childRun, memoryContext, memoryPorts, sampleHits } from '../memory/steps.testing';
import { passed, readoutTrace } from '../memory/testing';
import { fakeStepContext } from '../runner/testing';
import type { FormMemoryPorts } from './ports';
import { recall, target, type FormMemoryOutputs } from './steps';

/** The page as the session composes it: five fields, no evidence yet. */
const GOAL = fieldGoal([]);

/** A field-answer run over the goal it was given, judged against one grounding criterion. */
const answersTrace = (goal: string, decision: RunTrace['finalDecision'] = 'accept'): RunTrace =>
  readoutTrace({
    pipeline: 'field-answer',
    goal,
    artifact: sampleAnswers(),
    locations: ['summary', 'field.1', 'field.2', 'field.3', 'field.4', 'field.5'],
    criteria: [{ id: 'c1', kind: 'grounding', statement: 'values rest on evidence' }],
    results: [passed('c1', 'grounding', ['field.1'])],
    decision,
  });

const disabledEmbeddings = (): CachedEmbeddings =>
  new CachedEmbeddings(new DisabledEmbeddingClient('no-key'), new InMemoryEmbeddingCache());

type Asked = { goal: string; criteria: readonly SuccessCriterion[] | undefined };

/** A context for one step: `execute` answers with a child over the goal it was asked for, recording the ask. */
function ctx(
  answer: ((goal: string) => RunRecord) | null,
  overrides: {
    goal?: string;
    criteria?: SuccessCriterion[];
    context?: Partial<MemoryContextDto>;
    outputs?: Partial<FormMemoryOutputs>;
    ports?: Partial<MemoryPorts>;
    acceptAt?: number | null;
  } = {},
) {
  const executed: Asked[] = [];
  const execute = (input: {
    goal: string;
    criteria?: readonly SuccessCriterion[];
  }): Promise<QualityRunDto> => {
    executed.push({ goal: input.goal, criteria: input.criteria });
    if (!answer) throw new Error('no child run was expected');
    return Promise.resolve(toRunDto(answer(input.goal)));
  };
  return {
    executed,
    ...fakeStepContext<FormMemoryOutputs, FormMemoryPorts>(memoryPorts(overrides.ports), execute, {
      request: {
        goal: overrides.goal ?? GOAL,
        ...(overrides.criteria === undefined ? {} : { criteria: overrides.criteria }),
      },
      context: memoryContext(overrides.context) as unknown as Record<string, unknown>,
      outputs: overrides.outputs ?? {},
      pipelines: ['field-answer'],
      acceptAtOf: () => (overrides.acceptAt === undefined ? 70 : overrides.acceptAt),
    }),
  };
}

const answered =
  (decision: RunTrace['finalDecision'] = 'accept', failed = false) =>
  (goal: string): RunRecord =>
    childRun('field-answer', failed ? null : answersTrace(goal, decision), failed);

describe('the form-memory steps', () => {
  it('[QL-38] recall probes the store with the fields’ own labels — no model call — and composes the evidence into the goal, aliased in order', async () => {
    const recalled = ctx(null);
    const result = await recall(recalled);
    expect(recalled.executed).toEqual([]);
    expect(result).toMatchObject({
      status: 'complete',
      counts: { probes: 5, candidates: 2, evidence: 2 },
    });
    expect(result.reason).toBeUndefined();
    const goal = result.output?.goal ?? '';
    expect(goal).toContain(FIELD_EVIDENCE_HEADING);
    expect(readFieldIndex(goal)?.evidence).toEqual([{ alias: 'm1' }, { alias: 'm2' }]);
    for (const hit of sampleHits) expect(goal).toContain(hit.text);
    expect(goal).toContain('· stored 2026-09-06 · system-design memory.');
    // The prose and the fields are the session's, untouched; only the evidence changed.
    expect(splitFieldGoal(goal)).toEqual({ prose: ANSWERING_PROSE, fields: sampleFields() });
  });

  it('[QL-38] an empty store is store-empty, and the target still runs over the goal as composed', async () => {
    const empty = {
      store: { ready: true, reason: null, note: null, model: 'm', collection: 'c', chunks: 0 },
    };
    const skipped = await recall(ctx(null, { context: empty }));
    expect(skipped).toMatchObject({ status: 'skipped', reason: 'store-empty' });
    expect(skipped.output).toBeUndefined();

    const bare = ctx(answered(), { context: empty });
    const run = await target(bare);
    expect(bare.executed.map((ask) => ask.goal)).toEqual([GOAL]);
    expect(run).toMatchObject({
      status: 'complete',
      counts: { iterations: 1 },
      report: { admission: 'admitted' },
    });
  });

  it('[QL-38] recall skips or fails with a closed reason for every way the world can be missing, and none of them is an error', async () => {
    const dark = ctx(null, {
      ports: {
        embedding: { enabled: false, model: null, reason: 'no-key' },
        embeddings: disabledEmbeddings(),
      },
    });
    expect(await recall(dark)).toMatchObject({
      status: 'skipped',
      reason: 'embeddings-disabled',
      note: 'no-key',
    });
    expect(
      await recall(
        ctx(null, {
          context: {
            store: {
              ready: false,
              reason: 'unreachable',
              note: 'down',
              model: null,
              collection: null,
              chunks: 0,
            },
          },
        }),
      ),
    ).toMatchObject({ status: 'skipped', reason: 'store-unavailable', note: 'down' });

    const unreachable = ctx(null);
    (unreachable.ports.store as InMemoryMemoryStore).unreachable = true;
    expect(await recall(unreachable)).toMatchObject({
      status: 'failed',
      reason: 'store-unavailable',
      note: 'store unreachable',
      counts: { probes: 5 },
    });
    expect(await recall(ctx(null, { ports: { embeddings: mutedEmbeddings() } }))).toMatchObject({
      status: 'failed',
      reason: 'embedding-failed',
      counts: { probes: 5 },
    });
    expect(await recall(ctx(null, { goal: renderDocumentGoal(resumeChunk()) }))).toMatchObject({
      status: 'skipped',
      reason: 'no-fields',
    });
    // A failed recall carries no error: the runner goes on to the target.
    expect((await recall(unreachable)).error).toBeUndefined();
  });

  it('[QL-38] target runs the answerer over the recalled goal with the request’s rubric, and reports the run’s admission', async () => {
    const recalled = (await recall(ctx(null))).output;
    if (recalled === undefined) throw new Error('the recall hands on a goal');
    const criteria = policyCriteria();
    const withEvidence = ctx(answered(), { outputs: { recall: recalled }, criteria });
    const admitted = await target(withEvidence);
    expect(withEvidence.executed).toEqual([{ goal: recalled.goal, criteria }]);
    expect(admitted).toMatchObject({
      status: 'complete',
      counts: { iterations: 1 },
      report: { admission: 'admitted' },
    });
    expect(admitted.output?.trace?.contract.goal).toBe(recalled.goal);

    const short = await target(ctx(answered('revise'), { outputs: { recall: recalled } }));
    expect(short).toMatchObject({ status: 'complete', report: { admission: 'fell-short' } });

    const failed = await target(ctx(answered('accept', true)));
    expect(failed).toMatchObject({ status: 'failed', reason: 'run-failed' });
    expect(failed.report).toBeUndefined();
    expect(failed.error?.message).toBe('the model went away');

    expect(await target(ctx(null, { acceptAt: null }))).toMatchObject({
      status: 'skipped',
      reason: 'pipeline-unavailable',
      note: 'field-answer',
    });
  });
});
