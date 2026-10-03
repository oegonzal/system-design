import type { QualityRunDto, RunTrace } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { InMemoryMemoryStore, mutedEmbeddings } from '../../modules/memory/testing';
import { fromRun } from '../../pipelines/experience-digest/from-run';
import { renderGoal as renderRecord } from '../../pipelines/experience-digest/input';
import {
  sampleDigest,
  sampleIterations,
  sampleRun,
} from '../../pipelines/experience-digest/testing';
import { renderGoal as renderQuery } from '../../pipelines/memory-recall/input';
import { samplePack } from '../../pipelines/memory-recall/testing';
import { bareGoal, MEMORY_HEADING } from './recall/inject';
import { probeSet } from './recall/query';
import { digest, recall, store, target } from './steps';
import { childRun as child, sampleHits as hits, stepContext as ctx } from './steps.testing';
import { builtQuery, faulting, fused, GOAL, passed, readoutTrace } from './testing';

const recallTrace = (decision: RunTrace['finalDecision'] = 'accept', faulted = false) =>
  readoutTrace({
    pipeline: 'memory-recall',
    goal: renderQuery(builtQuery(GOAL, probeSet(GOAL, []), fused(hits))),
    artifact: samplePack({ kept: samplePack().kept, dropped: [] }),
    locations: ['summary', 'm1', 'm2', 'gap.1'],
    criteria: [{ id: 'c1', kind: 'need', statement: 'x' }],
    results: [passed('c1', 'need', ['m1'])],
    findings: faulted
      ? [faulting('irrelevant_chunk', ['m1']), faulting('irrelevant_chunk', ['m2'])]
      : [],
    decision,
  });

const targetTrace = (decision: RunTrace['finalDecision'] = 'accept') =>
  readoutTrace({
    pipeline: 'system-design',
    goal: GOAL,
    artifact: { summary: 'a design' },
    locations: ['summary'],
    criteria: [{ id: 'c1', kind: 'functional', statement: 'x' }],
    results: [passed('c1', 'functional', ['summary'])],
    decision,
  });

/** The digest child's trace: its goal is the record the step composes, index included. */
const digestTraceFor = (source: QualityRunDto, decision: RunTrace['finalDecision'] = 'accept') => {
  const trace = source.trace;
  if (trace === null) throw new Error('a source with a trace');
  const record = fromRun({
    ...source,
    trace: { ...trace, contract: { ...trace.contract, goal: bareGoal(trace.contract.goal) } },
  });
  if (record === null) throw new Error('the source must compose');
  return readoutTrace({
    pipeline: 'experience-digest',
    goal: renderRecord(record),
    artifact: sampleDigest({
      memories: [{ ...sampleDigest().memories[0], evidence: ['r1'] }],
      unused: [],
    }),
    locations: ['summary', 'memory.1', 'r1'],
    criteria: [{ id: 'c1', kind: 'signal', statement: 'x' }],
    results: [passed('c1', 'signal', ['memory.1'])],
    decision,
  });
};

const source: QualityRunDto = {
  ...child('system-design', targetTrace()),
  request: {
    goal: `${GOAL}\n\n${MEMORY_HEADING}\n\n- [m1] x`,
    outputProvided: false,
    criteriaProvided: false,

    adoptedFrom: null,
    maxIterations: 1,
  },
  exchanges: [],
  trace: {
    ...targetTrace(),
    contract: {
      goal: `${GOAL}\n\n${MEMORY_HEADING}\n\n- [m1] x`,
      criteria: targetTrace().contract.criteria,
    },
  },
};

describe('the memory steps', () => {
  it('[QL-16] recall hands on the goal with memory only when the pack was accepted with usable chunks', async () => {
    const accepted = ctx(child('memory-recall', recallTrace()));
    const result = await recall(accepted);
    expect(result).toMatchObject({
      status: 'complete',
      counts: { candidates: 2, kept: 2, usable: 2, injected: 2 },
    });
    expect(result.output?.goal).toContain(MEMORY_HEADING);
    expect(accepted.executed[0].goal).toContain('### [m1] lesson');

    const notAccepted = await recall(ctx(child('memory-recall', recallTrace('revise'))));
    expect(notAccepted).toMatchObject({
      status: 'complete',
      reason: 'not-accepted',
      counts: { usable: 0 },
    });
    expect(notAccepted.output).toBeUndefined();
    expect(await recall(ctx(child('memory-recall', recallTrace('accept', true))))).toMatchObject({
      status: 'complete',
      reason: 'no-usable-memory',
    });
    const unjudged = recallTrace('escalate');
    expect(
      await recall(
        ctx(
          child('memory-recall', { ...unjudged, contract: { ...unjudged.contract, criteria: [] } }),
        ),
      ),
    ).toMatchObject({ status: 'complete', reason: 'no-rubric', counts: { usable: 0 } });
    expect(
      await recall(ctx(child('memory-recall', recallTrace()), { goal: 'x'.repeat(64_000) })),
    ).toMatchObject({ status: 'complete', reason: 'goal-at-budget' });
  });

  it('[QL-16] recall skips or fails with a closed reason for every way the world can be missing', async () => {
    expect(await recall(ctx(child('memory-recall', null, true)))).toMatchObject({
      status: 'failed',
      reason: 'run-failed',
      note: 'the model went away',
    });

    const dark = ctx(null);
    (dark.ports.store as InMemoryMemoryStore).unreachable = true;
    expect(await recall(dark)).toMatchObject({
      status: 'failed',
      reason: 'store-unavailable',
      note: 'store unreachable',
    });

    expect(await recall(ctx(null, { ports: { embeddings: mutedEmbeddings() } }))).toMatchObject({
      status: 'failed',
      reason: 'embedding-failed',
    });
    expect(await recall(ctx(null, { acceptAt: null }))).toMatchObject({
      status: 'skipped',
      reason: 'pipeline-unavailable',
      note: 'memory-recall',
    });
    expect(
      await recall(
        ctx(null, {
          context: {
            store: {
              ready: true,
              reason: null,
              note: null,
              model: 'm',
              collection: 'c',
              chunks: 0,
            },
          },
        }),
      ),
    ).toMatchObject({ status: 'skipped', reason: 'store-empty' });
  });

  it("[QL-16] a failed target is the run's failure, with the error kept", async () => {
    const failed = await target(ctx(child('system-design', null, true)));
    expect(failed).toMatchObject({ status: 'failed', reason: 'run-failed' });
    expect(failed.error?.message).toBe('the model went away');

    const withMemory = ctx(child('system-design', targetTrace()), {
      outputs: { recall: { goal: `${GOAL}\n\n${MEMORY_HEADING}\n` } },
    });
    const ok = await target(withMemory);
    expect(ok).toMatchObject({ status: 'complete', counts: { iterations: 1 } });
    expect(ok.output?.trace?.finalDecision).toBe('accept');
    expect(withMemory.executed[0].goal).toContain(MEMORY_HEADING);
  });

  it('[QL-16] digest judges the bare prompt and endorses nothing short of accept', async () => {
    const accepted = ctx(() => child('experience-digest', digestTraceFor(source)), {
      outputs: { target: source },
    });
    const digested = await digest(accepted);
    expect(accepted.executed[0].goal).not.toContain(MEMORY_HEADING);
    expect(accepted.executed[0].goal).toContain(GOAL);
    expect(digested).toMatchObject({ status: 'complete', counts: { memories: 1, kept: 1 } });
    expect(digested.output?.memories).toHaveLength(1);

    const belowTheBar = await digest(
      ctx(child('experience-digest', digestTraceFor(source, 'revise')), {
        outputs: { target: source },
      }),
    );
    expect(belowTheBar).toMatchObject({ status: 'complete', reason: 'not-accepted' });
    expect(belowTheBar.output).toBeUndefined();

    // A digest that derived no rubric was never judged: the step says so,
    // with what the digest proposed, and never calls it a shortfall.
    const judgedAgainstNothing = digestTraceFor(source, 'escalate');
    const noRubric = await digest(
      ctx(
        child('experience-digest', {
          ...judgedAgainstNothing,
          contract: { ...judgedAgainstNothing.contract, criteria: [] },
        }),
        { outputs: { target: source } },
      ),
    );
    expect(noRubric).toMatchObject({
      status: 'complete',
      reason: 'no-rubric',
      counts: { memories: 1, kept: 0 },
    });
    expect(noRubric.output).toBeUndefined();
    const [only] = judgedAgainstNothing.iterations;
    const noArtifact = await digest(
      ctx(
        child('experience-digest', {
          ...judgedAgainstNothing,
          iterations: [
            { ...only, artifact: null, ledger: { ...only.ledger, artifactPresent: false } },
          ],
        }),
        { outputs: { target: source } },
      ),
    );
    expect(noArtifact).toMatchObject({
      status: 'complete',
      reason: 'no-artifact',
      counts: { memories: 0, kept: 0 },
    });
    expect(
      await digest(ctx(child('experience-digest', null, true), { outputs: { target: source } })),
    ).toMatchObject({ status: 'failed', reason: 'run-failed' });
    expect(
      await digest(ctx(null, { outputs: { target: { ...source, trace: null } } })),
    ).toMatchObject({
      status: 'skipped',
      reason: 'nothing-to-digest',
    });
    expect(await digest(ctx(null))).toMatchObject({
      status: 'skipped',
      reason: 'upstream-skipped',
      note: 'target',
    });
  });

  it('[QL-44] digest skips a target whose only judged iteration it adopted, naming the run it adopted from, and digests one that judged its own revision', async () => {
    const run = sampleRun();
    const trace = run.trace;
    if (trace === null) throw new Error('the sample run carries a trace');
    const [first, second] = sampleIterations();
    const adopted = { ...first, mode: 'adopted' as const };
    const grade = { runId: 'grade-run', iteration: 2 };
    const coach = (iterations: typeof trace.iterations, bestIteration: number): QualityRunDto => ({
      ...run,
      request: { ...run.request, adoptedFrom: grade },
      trace: {
        ...trace,
        iterations,
        bestIteration,
        lessons: bestIteration === 1 ? [] : trace.lessons,
      },
    });

    // As the measured siblings went: the copy, then a revision that produced nothing.
    const sibling = coach(
      [
        adopted,
        {
          ...second,
          artifact: null,
          rendered: null,
          ledger: { ...second.ledger, artifactPresent: false, criteria: [], findings: [] },
        },
      ],
      1,
    );
    const copied = ctx(() => child('experience-digest', digestTraceFor(sibling)), {
      outputs: { target: sibling },
    });
    expect(await digest(copied)).toEqual({
      status: 'skipped',
      reason: 'nothing-new',
      note: grade.runId,
    });
    expect(copied.executed).toEqual([]);

    const revised = coach([adopted, second], 2);
    const judged = ctx(() => child('experience-digest', digestTraceFor(revised)), {
      outputs: { target: revised },
    });
    expect(await digest(judged)).toMatchObject({ status: 'complete', counts: { kept: 1 } });
    expect(judged.executed[0].goal).toContain('· seen i1 · adopted from an earlier run ·');
  });

  it('[QL-16] store explains why it did not write, and writes one lesson as two indexed texts', async () => {
    const digested = {
      digestRunId: 'd',
      memories:
        (
          await digest(
            ctx(() => child('experience-digest', digestTraceFor(source)), {
              outputs: { target: source },
            }),
          )
        ).output?.memories ?? [],
    };
    expect(digested.memories).toHaveLength(1);

    expect(
      await store(
        ctx(null, {
          outputs: { target: source, digest: digested },
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
    expect(
      await store(
        ctx(null, {
          outputs: { target: source, digest: digested },
          ports: { embeddings: mutedEmbeddings() },
        }),
      ),
    ).toMatchObject({ status: 'failed', reason: 'embedding-failed' });

    const written = ctx(null, { outputs: { target: source, digest: digested } });
    // One lesson, two vectors: `embedded` counts texts the provider was asked
    // for, and a chunk is indexed by its condition and by its instruction.
    expect(await store(written)).toMatchObject({
      status: 'complete',
      counts: { chunks: 1, embedded: 2 },
    });
    const stored = [...(written.ports.store as InMemoryMemoryStore).points.values()].find(
      (chunk) => chunk.source.runId === source.runId,
    );
    expect(stored?.source).toMatchObject({
      kind: 'lesson',
      ref: 'memory.1',
      pipeline: 'system-design',
      decision: 'accept',
      iteration: 1,
    });
    expect(stored?.digestRunId).toBe('d');
  });
});
