import type { MemoryContextDto, QualityRunDto, RunTrace } from '@sysdesign/contracts';
import { renderDocumentGoal, resumeChunk } from '@sysdesign/contracts';
import { DisabledEmbeddingClient } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { toRunDto, type RunRecord } from '../../core/contracts';
import {
  InMemoryEmbeddingCache,
  InMemoryMemoryStore,
  mutedEmbeddings,
} from '../../modules/memory/testing';
import { sampleDocumentDigest } from '../../pipelines/document-digest/testing';
import { CachedEmbeddings } from '../memory/embeddings';
import type { MemoryPorts } from '../memory/ports';
import { childRun, memoryContext, memoryPorts } from '../memory/steps.testing';
import { faulting, passed, readoutTrace } from '../memory/testing';
import { fakeStepContext } from '../runner/testing';
import type { DocumentMemoryPorts } from './ports';
import { digest, store, type DocumentMemoryOutputs } from './steps';

const GOAL = renderDocumentGoal(resumeChunk());
const ACCEPT_AT = 75;

/** A document-digest run over the résumé chunk, judged against one fact criterion. */
const digestTrace = (
  decision: RunTrace['finalDecision'] = 'accept',
  overrides: Partial<Parameters<typeof readoutTrace>[0]> = {},
): RunTrace =>
  readoutTrace({
    pipeline: 'document-digest',
    goal: GOAL,
    artifact: sampleDocumentDigest(),
    locations: ['summary', 'memory.1', 'memory.2', 'section.3'],
    criteria: [{ id: 'c1', kind: 'fact', statement: 'captures the Acme role in section.2' }],
    results: [passed('c1', 'fact', ['memory.1'])],
    decision,
    ...overrides,
  });

const disabledEmbeddings = (): CachedEmbeddings =>
  new CachedEmbeddings(new DisabledEmbeddingClient('no-key'), new InMemoryEmbeddingCache());

/** A context for one step: `execute` answers with the canned child, recording what it was asked. */
function ctx(
  answer: RunRecord | null,
  overrides: {
    goal?: string;
    context?: Partial<MemoryContextDto>;
    outputs?: Partial<DocumentMemoryOutputs>;
    ports?: Partial<MemoryPorts>;
    acceptAt?: number | null;
  } = {},
) {
  const executed: { goal: string; maxIterations: number | undefined }[] = [];
  const execute = (input: { goal: string; maxIterations?: number }): Promise<QualityRunDto> => {
    executed.push({ goal: input.goal, maxIterations: input.maxIterations });
    if (!answer) throw new Error('no child run was expected');
    return Promise.resolve(toRunDto(answer));
  };
  return {
    executed,
    ...fakeStepContext<DocumentMemoryOutputs, DocumentMemoryPorts>(
      memoryPorts(overrides.ports),
      execute,
      {
        request: { goal: overrides.goal ?? GOAL, maxIterations: 2 },
        context: memoryContext(overrides.context) as unknown as Record<string, unknown>,
        outputs: overrides.outputs ?? {},
        pipelines: ['document-digest'],
        acceptAtOf: () => (overrides.acceptAt === undefined ? ACCEPT_AT : overrides.acceptAt),
      },
    ),
  };
}

const child = (trace: RunTrace | null, failed = false): RunRecord =>
  childRun('document-digest', trace, failed);

describe('the document-memory steps', () => {
  it('[QL-40] digest runs the pipeline over the chunk with the request’s budget, reports the document, and hands the run on as its own source', async () => {
    const accepted = ctx(child(digestTrace()));
    const digested = await digest(accepted);
    expect(accepted.executed).toEqual([{ goal: GOAL, maxIterations: 2 }]);
    expect(digested).toMatchObject({
      status: 'complete',
      counts: { memories: 2, kept: 2 },
      report: {
        kind: 'resume',
        title: 'Résumé',
        subject: 'Alex Example',
        date: '2026-03-01',
        chunk: { index: 1, of: 1 },
      },
    });
    expect(digested.reason).toBeUndefined();
    expect(digested.output?.source.runId).toBe('document-digest-run');
    expect(digested.output?.digested.digestRunId).toBe('document-digest-run');
    expect(digested.output?.digested.memories.map((memory) => memory.evidence)).toEqual([
      [{ kind: 'section', ref: 'section.2' }],
      [{ kind: 'section', ref: 'section.1' }],
    ]);

    // A faulted memory is withheld; the one beside it is kept, blocker on the page or not.
    const faulted = await digest(
      ctx(
        child(
          digestTrace('revise', {
            overall: 90,
            policyAllowed: false,
            findings: [faulting('invented_fact', ['memory.1'])],
          }),
        ),
      ),
    );
    expect(faulted).toMatchObject({ status: 'complete', counts: { memories: 2, kept: 1 } });
    expect(faulted.output?.digested.memories.map((memory) => memory.position)).toEqual([2]);
  });

  it('[QL-40] digest says why it endorsed nothing, and never calls an unjudged digest a shortfall', async () => {
    const belowTheBar = await digest(ctx(child(digestTrace('revise'))));
    expect(belowTheBar).toMatchObject({
      status: 'complete',
      reason: 'not-accepted',
      counts: { memories: 2, kept: 0 },
      report: { subject: 'Alex Example' },
    });
    expect(belowTheBar.output).toBeUndefined();

    const unjudged = digestTrace('escalate');
    expect(
      await digest(ctx(child({ ...unjudged, contract: { ...unjudged.contract, criteria: [] } }))),
    ).toMatchObject({ status: 'complete', reason: 'no-rubric', counts: { memories: 2, kept: 0 } });

    const [only] = unjudged.iterations;
    expect(
      await digest(
        ctx(
          child({
            ...unjudged,
            iterations: [
              { ...only, artifact: null, ledger: { ...only.ledger, artifactPresent: false } },
            ],
          }),
        ),
      ),
    ).toMatchObject({
      status: 'complete',
      reason: 'no-artifact',
      counts: { memories: 0, kept: 0 },
    });

    const everyMemoryFaulted = await digest(
      ctx(
        child(
          digestTrace('accept', {
            findings: [faulting('invented_fact', ['memory.1', 'memory.2'])],
          }),
        ),
      ),
    );
    expect(everyMemoryFaulted).toMatchObject({
      status: 'complete',
      reason: 'no-memories',
      counts: { memories: 2, kept: 0 },
    });

    expect(await digest(ctx(child(null, true)))).toMatchObject({
      status: 'failed',
      reason: 'run-failed',
      note: 'the model went away',
    });

    const dark = ctx(null, {
      ports: { embeddings: disabledEmbeddings() },
      context: { embedding: { enabled: false, model: null, reason: 'no-key' } },
    });
    expect(await digest(dark)).toMatchObject({
      status: 'skipped',
      reason: 'embeddings-disabled',
      note: 'no-key',
    });
    expect(dark.executed).toEqual([]);
    expect(await digest(ctx(null, { acceptAt: null }))).toMatchObject({
      status: 'skipped',
      reason: 'pipeline-unavailable',
      note: 'document-digest',
    });
    // The definition refuses such a goal before a row exists; reaching the step with one is a fault.
    await expect(digest(ctx(null, { goal: 'Just a prompt.' }))).rejects.toThrow(
      /carries no document-digest index/,
    );
  });

  it('[QL-40] store writes the facts with the digest run as their own source — pipeline document-digest, evidence of kind section — and says why it did not', async () => {
    const digested = (await digest(ctx(child(digestTrace())))).output;
    if (digested === undefined) throw new Error('the accepted digest hands on its memories');

    const written = ctx(null, { outputs: { digest: digested } });
    // Two facts, two vectors each: `embedded` counts the texts the provider was asked for.
    expect(await store(written)).toMatchObject({
      status: 'complete',
      counts: { chunks: 2, embedded: 4 },
    });
    const points = [...(written.ports.store as InMemoryMemoryStore).points.values()].filter(
      (chunk) => chunk.source.runId === 'document-digest-run',
    );
    expect(points.map((chunk) => chunk.source.ref)).toEqual(['memory.1', 'memory.2']);
    for (const point of points) {
      expect(point.source).toMatchObject({
        pipeline: 'document-digest',
        kind: 'lesson',
        decision: 'accept',
        iteration: 1,
      });
      expect(point.digestRunId).toBe(point.source.runId);
      expect(point.evidence.map((item) => item.kind)).toEqual(['section']);
    }
    const [role] = sampleDocumentDigest().memories;
    expect(points[0].keys).toEqual({ condition: role.appliesWhen, lesson: role.insight });
    expect(points[0].text).toBe(`${role.insight} — applies when ${role.appliesWhen}`);

    expect(
      await store(
        ctx(null, {
          outputs: { digest: digested },
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
        ctx(null, { outputs: { digest: digested }, ports: { embeddings: mutedEmbeddings() } }),
      ),
    ).toMatchObject({ status: 'failed', reason: 'embedding-failed' });
    const unreachable = ctx(null, { outputs: { digest: digested } });
    (unreachable.ports.store as InMemoryMemoryStore).unreachable = true;
    expect(await store(unreachable)).toMatchObject({
      status: 'failed',
      reason: 'store-unavailable',
      note: 'store unreachable',
    });
    expect(await store(ctx(null))).toMatchObject({
      status: 'skipped',
      reason: 'upstream-skipped',
      note: 'digest',
    });
  });
});
