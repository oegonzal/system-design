import type { PipelineSummary } from '@sysdesign/contracts';
import {
  DOCUMENT_MEMORY_STEP_REASONS,
  renderDocumentGoal,
  resumeChunk,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { InMemoryMemoryStore } from '../../modules/memory/testing';
import { sampleDocumentDigest } from '../../pipelines/document-digest/testing';
import { fieldGoal } from '../../pipelines/field-answer/testing';
import { childRun, memoryPorts } from '../memory/steps.testing';
import { passed, readoutTrace } from '../memory/testing';
import { validateOrchestrator } from '../runner/definition';
import { orchestrationDeps, performed, summaryOf } from '../runner/testing';
import { DOCUMENT_MEMORY } from './definition';

const GOAL = renderDocumentGoal(resumeChunk());
const registry: PipelineSummary[] = [summaryOf('document-digest', 75, 'composed')];

describe('the document-memory orchestrator', () => {
  it('[QL-40] is valid data: a digest over the document-digest pipeline, then a store that needs it; it chooses its own pipeline and declares the contract’s reasons', () => {
    expect(() => validateOrchestrator(DOCUMENT_MEMORY as never)).not.toThrow();
    expect(DOCUMENT_MEMORY.takesTarget).toBe(false);
    expect(DOCUMENT_MEMORY.reasons).toBe(DOCUMENT_MEMORY_STEP_REASONS);
    expect(DOCUMENT_MEMORY.steps.map((step) => [step.id, step.pipeline, step.needs])).toEqual([
      ['digest', 'document-digest', undefined],
      ['store', undefined, ['digest']],
    ]);
    // A provided artifact is not refused: a digest handed in is judged as the step's own would be.
    expect(DOCUMENT_MEMORY.steps.every((step) => step.provided === undefined)).toBe(true);
  });

  it('[QL-40] refuses a goal no document composer rendered, and nothing else', () => {
    expect(DOCUMENT_MEMORY.refuse?.({ goal: 'Just a prompt.' }, registry)).toMatch(
      /carries no document-digest index/,
    );
    expect(DOCUMENT_MEMORY.refuse?.({ goal: fieldGoal() }, registry)).toMatch(/document-digest/);
    expect(DOCUMENT_MEMORY.refuse?.({ goal: GOAL }, registry)).toBeNull();
    expect(
      DOCUMENT_MEMORY.refuse?.({ goal: GOAL, output: sampleDocumentDigest() }, registry),
    ).toBeNull();
  });

  it('[QL-40] run over the runner, a chunk becomes stored facts: the digest run is recorded, reported and stamped as every point’s source', async () => {
    const ports = memoryPorts();
    const asked: { pipeline: string; goal: string; maxIterations: number | undefined }[] = [];
    const deps = orchestrationDeps(
      ports,
      (request, onOpened) => {
        asked.push({
          pipeline: request.pipeline,
          goal: request.goal,
          maxIterations: request.maxIterations,
        });
        const run = childRun(
          'document-digest',
          readoutTrace({
            pipeline: 'document-digest',
            goal: request.goal,
            artifact: sampleDocumentDigest(),
            locations: ['summary', 'memory.1', 'memory.2', 'section.3'],
            criteria: [{ id: 'c1', kind: 'fact', statement: 'captures the Acme role' }],
            results: [passed('c1', 'fact', ['memory.1'])],
          }),
        );
        onOpened?.(run);
        return Promise.resolve(run);
      },
      { pipelines: () => registry },
    );
    const record = await performed(DOCUMENT_MEMORY, { goal: GOAL }, deps, {
      context: await DOCUMENT_MEMORY.context(ports),
    });

    expect(asked).toEqual([{ pipeline: 'document-digest', goal: GOAL, maxIterations: 1 }]);
    expect(record.status).toBe('complete');
    expect(record.pipeline).toBeNull();
    expect(record.context).toMatchObject({
      embedding: { enabled: true, model: 'fake-embedding' },
      store: { ready: true, chunks: 2 },
    });
    expect(record.steps['digest']).toMatchObject({
      status: 'complete',
      reason: null,
      runIds: ['document-digest-run'],
      counts: { memories: 2, kept: 2 },
      report: { kind: 'resume', subject: 'Alex Example', chunk: { index: 1, of: 1 } },
    });
    expect(record.steps['store']).toMatchObject({
      status: 'complete',
      reason: null,
      runIds: [],
      counts: { chunks: 2, embedded: 4 },
    });
    const points = [...(ports.store as InMemoryMemoryStore).points.values()].filter(
      (chunk) => chunk.source.pipeline === 'document-digest',
    );
    expect(points).toHaveLength(2);
    for (const point of points) {
      expect(point.source.runId).toBe('document-digest-run');
      expect(point.digestRunId).toBe('document-digest-run');
      expect(point.evidence).toEqual([
        { kind: 'section', ref: expect.stringMatching(/^section\./) },
      ]);
    }
  });

  it('[QL-67] declares the shape of its context and of the digest step’s report', () => {
    expect(Object.keys(DOCUMENT_MEMORY.reports)).toEqual(['digest']);
    expect(DOCUMENT_MEMORY.contextSchema.safeParse({ bogus: true }).success).toBe(false);
    const report = DOCUMENT_MEMORY.reports.digest;
    expect(
      report?.safeParse({
        kind: 'resume',
        title: 'Résumé',
        subject: 'Alex Example',
        date: null,
        chunk: { index: 1, of: 2 },
      }).success,
    ).toBe(true);
    expect(report?.safeParse({ kind: 'resume', title: 'Résumé' }).success).toBe(false);
  });
});
