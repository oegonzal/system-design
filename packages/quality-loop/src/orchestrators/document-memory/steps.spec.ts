import type { MemoryContextDto, QualityRunDto, RunTrace } from '@sysdesign/contracts';
import {
  DOCUMENT_MEMORY_KINDS,
  documentDigestReportSchema,
  MEMORY_SCOPES,
  renderDocumentGoal,
  resumeChunk,
} from '@sysdesign/contracts';
import { DisabledEmbeddingClient } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { toRunDto, type RunRecord } from '../../core/contracts';
import {
  InMemoryEmbeddingCache,
  InMemoryMemoryStore,
  mutedEmbeddings,
} from '../../modules/memory/testing';
import { SCOPE_FINDING_TYPE } from '../../pipelines/document-digest/definition';
import { sampleDocumentDigest } from '../../pipelines/document-digest/testing';
import { CachedEmbeddings } from '../memory/embeddings';
import { chunkKind, DEFAULT_CHUNK_KIND } from '../memory/store/chunks';
import type { MemoryPorts } from '../memory/ports';
import { childRun, memoryContext, memoryPorts } from '../memory/steps.testing';
import { faulting, passed, readoutTrace } from '../memory/testing';
import { fakeStepContext } from '../runner/testing';
import type { DocumentMemoryPorts } from './ports';
import { digest, store, type DocumentMemoryOutputs, DOCUMENT_MEMORY_OWNED } from './steps';

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
    criteria: [
      { id: 'c1', kind: 'profile_fact', statement: 'captures the Acme role in section.2' },
    ],
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
  it('[QL-40] files a stray under the lesson this writer already wrote, through the list the step actually passes', () => {
    // The ORDER of DOCUMENT_MEMORY_OWNED is behaviour, not presentation: the
    // first kind is where a memory declaring one this writer does not own gets
    // filed. Sorting the list keeps it non-empty and keeps `written ⊆ owned`
    // true, so neither the type nor a case that builds its own literal can
    // object — this asserts through the constant the step passes, so a tidy-up
    // that reorders it fails here instead of silently moving every future stray.
    expect(chunkKind('pattern', DOCUMENT_MEMORY_OWNED)).toBe(DEFAULT_CHUNK_KIND);
    expect(chunkKind(undefined, DOCUMENT_MEMORY_OWNED)).toBe(DEFAULT_CHUNK_KIND);
    // And it owns every kind the digest may declare, so none of them orphans.
    for (const kind of DOCUMENT_MEMORY_KINDS) {
      expect(DOCUMENT_MEMORY_OWNED).toContain(kind);
      expect(chunkKind(kind, DOCUMENT_MEMORY_OWNED)).toBe(kind);
    }
  });

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

  it('[QL-69] digest draws on a run judged below the bar where the engine’s gates held, withholding what a finding withholds, and says so', async () => {
    // A document transcribes what someone stated: a digest scored low for its
    // writing is stored, not lost. Measured 2026-10-12: five taught answers
    // ended `revise`/`retry` on a one-section document and were asked again.
    const belowTheBar = await digest(ctx(child(digestTrace('revise'))));
    expect(belowTheBar).toMatchObject({
      status: 'complete',
      note: 'judged below the bar, not refuted: stored',
      counts: { memories: 2, kept: 2 },
      report: { subject: 'Alex Example' },
    });
    expect(belowTheBar.reason).toBeUndefined();
    expect(belowTheBar.output?.digested.memories.map((memory) => memory.position)).toEqual([1, 2]);

    // What a confirmed finding withholds is withheld below the bar as above it.
    const refuted = await digest(
      ctx(child(digestTrace('revise', { findings: [faulting('invented_fact', ['memory.1'])] }))),
    );
    expect(refuted).toMatchObject({ status: 'complete', counts: { memories: 2, kept: 1 } });
    expect(refuted.output?.digested.memories.map((memory) => memory.position)).toEqual([2]);

    // Below the bar with a validator the artifact did not pass: nothing is drawn on.
    const unvalidated = await digest(
      ctx(child(digestTrace('revise', { validatorsPassed: false }))),
    );
    expect(unvalidated).toMatchObject({
      status: 'complete',
      reason: 'not-accepted',
      counts: { memories: 2, kept: 0 },
    });
    expect(unvalidated.output).toBeUndefined();
  });

  it('[QL-69] a document that declares its scope has every memory stored under it, whatever the digest wrote, and a finding against a memory’s scope withholds nothing there — that finding alone, a memory confirmed false withheld there as anywhere', async () => {
    // The digest scoped the role unit and the home subject, and both samples of
    // a critic faulted the role's scope: the document's declaration decides.
    const [role, home] = sampleDocumentDigest().memories;
    const artifact = sampleDocumentDigest({ memories: [{ ...role, scope: 'unit' }, home] });
    const faulted = [faulting(SCOPE_FINDING_TYPE, ['memory.1'])];
    for (const scope of MEMORY_SCOPES) {
      const goal = renderDocumentGoal({ ...resumeChunk(), scope });
      const digested = await digest(
        ctx(child(digestTrace('accept', { goal, artifact, findings: faulted })), { goal }),
      );
      expect(digested).toMatchObject({
        status: 'complete',
        counts: { memories: 2, kept: 2 },
        report: { subject: 'Alex Example', scope },
      });
      // The report names the declaration in the shape the orchestrator declares for the step.
      expect(documentDigestReportSchema.safeParse(digested.report).success).toBe(true);
      const { output } = digested;
      if (output === undefined) throw new Error('the declared digest hands on its memories');

      const written = ctx(null, { outputs: { digest: output } });
      expect(await store(written)).toMatchObject({ status: 'complete', counts: { chunks: 2 } });
      const stored = [...(written.ports.store as InMemoryMemoryStore).points.values()]
        .filter((chunk) => chunk.source.runId === 'document-digest-run')
        .map((chunk) => [chunk.source.ref, chunk.scope]);
      expect(stored).toEqual([
        ['memory.1', scope],
        ['memory.2', scope],
      ]);

      // The declaration settles the scope finding and nothing else: beside the
      // memory faulted for its scope, which it keeps, a memory confirmed false
      // is withheld under it as without one.
      for (const falsehood of ['invented_fact', 'misread_section']) {
        const findings = [...faulted, faulting(falsehood, ['memory.2'])];
        const narrowed = await digest(
          ctx(child(digestTrace('accept', { goal, artifact, findings })), { goal }),
        );
        expect(narrowed).toMatchObject({ status: 'complete', counts: { memories: 2, kept: 1 } });
        expect(
          narrowed.output?.digested.memories.map((memory) => [memory.position, memory.scope]),
        ).toEqual([[1, scope]]);
      }
    }

    // A document that declares nothing keeps the scopes its digest wrote, and
    // there the same finding withholds the memory it names.
    const own = await digest(ctx(child(digestTrace('accept', { artifact }))));
    expect(own.report).not.toHaveProperty('scope');
    expect(own.output?.digested.memories.map((memory) => memory.scope)).toEqual([
      'unit',
      'subject',
    ]);
    const withheld = await digest(
      ctx(child(digestTrace('accept', { artifact, findings: faulted }))),
    );
    expect(withheld).toMatchObject({ status: 'complete', counts: { memories: 2, kept: 1 } });
    expect(withheld.output?.digested.memories.map((memory) => memory.position)).toEqual([2]);
  });

  it('[QL-40] digest says why it endorsed nothing, and never calls an unjudged digest a shortfall', async () => {
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
        // The kind the digest declared for the item, not a fixed one: a probe
        // narrowing to facts must not also return a story or a boundary.
        kind: 'profile_fact',
        decision: 'accept',
        iteration: 1,
      });
      expect(point.digestRunId).toBe(point.source.runId);
      expect(point.evidence.map((item) => item.kind)).toEqual(['section']);
      // The scope the digest declared rides on the point, for the form goals to render.
      expect(point.scope).toBe('subject');
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
