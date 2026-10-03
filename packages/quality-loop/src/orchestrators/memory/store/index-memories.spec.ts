import type { QualityRunDto, RunTrace } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { InMemoryMemoryStore } from '../../../modules/memory/testing';
import { contentHash } from '../ports';
import { MEMORY_HEADING } from '../recall/inject';
import { childRun, memoryPorts } from '../steps.testing';
import { readoutTrace } from '../testing';
import { indexMemories, originOf } from './index-memories';

/**
 * A coach run as the measured one went: iteration 1 adopted and decided
 * revise, iteration 2 judged and decided revise (the best), iteration 3 with
 * no artifact — so the run escalated.
 */
function escalatedAfterJudged(): RunTrace {
  const judged = readoutTrace({
    pipeline: 'system-design-canvas',
    goal: 'design a link shortener',
    artifact: { graph: 'g' },
    locations: ['node.1'],
    decision: 'revise',
  });
  const [first] = judged.iterations;
  const nothing = {
    ...first,
    iteration: 3,
    artifact: null,
    rendered: null,
    ledger: { ...first.ledger, artifactPresent: false },
    decision: {
      ...first.decision,
      finalDecision: 'escalate' as const,
      gates: { ...first.decision.gates, artifactPresent: false },
      scores: { dimensions: {}, overall: 0 },
      reason: 'no artifact to judge',
    },
  };
  return {
    ...judged,
    iterations: [first, { ...first, iteration: 2 }, nothing],
    bestIteration: 2,
    finalDecision: 'escalate',
    stopReason: 'escalated',
  };
}

/**
 * A coach run as the measured siblings went: iteration 1 adopted from a
 * grade's revision and decided revise, iteration 2 with no artifact — so the
 * best is the adopted copy, and nothing in the run was judged here.
 */
function escalatedOverAdopted(): RunTrace {
  const trace = escalatedAfterJudged();
  const [adopted, , nothing] = trace.iterations;
  return {
    ...trace,
    iterations: [
      { ...adopted, mode: 'adopted' },
      { ...nothing, iteration: 2 },
    ],
    bestIteration: 1,
  };
}

const GRADE = { runId: 'grade-run', iteration: 2 };

describe('a stored lesson’s origin', () => {
  it('[QL-35] carries the decision and number of the iteration it cites, not the run’s final decision', () => {
    const trace = escalatedAfterJudged();
    const source: QualityRunDto = { ...childRun('system-design-canvas', trace), trace };
    expect(originOf(source, trace).source).toMatchObject({
      runId: source.runId,
      pipeline: 'system-design-canvas',
      decision: 'revise',
      iteration: 2,
    });
  });

  it('[QL-43] names the iteration whose judges produced the evidence: this run’s best, or the adopted one when the best is the copy', () => {
    const judged = escalatedAfterJudged();
    const own: QualityRunDto = { ...childRun('system-design-canvas', judged), trace: judged };
    expect(originOf(own, judged).lineage).toEqual({
      judged: { runId: own.runId, iteration: 2 },
      adoptedFrom: null,
      goalHash: contentHash('design a link shortener'),
    });

    // A coach whose own revision was judged: the lesson is its own, and the run it adopted is kept beside it.
    const coachTrace: RunTrace = {
      ...judged,
      iterations: judged.iterations.map((iteration, index) =>
        index === 0 ? { ...iteration, mode: 'adopted' } : iteration,
      ),
    };
    const coach: QualityRunDto = {
      ...own,
      request: { ...own.request, adoptedFrom: GRADE, maxIterations: 3 },
      trace: coachTrace,
    };
    expect(originOf(coach, coachTrace).lineage).toEqual({
      judged: { runId: own.runId, iteration: 2 },
      adoptedFrom: GRADE,
      goalHash: contentHash('design a link shortener'),
    });

    // A coach whose best is the adopted copy: the evidence was judged by the grade, and the lineage says so.
    const copied = escalatedOverAdopted();
    const sibling: QualityRunDto = {
      ...childRun('system-design-canvas', copied),
      request: { ...own.request, adoptedFrom: GRADE, maxIterations: 2 },
      trace: copied,
    };
    expect(originOf(sibling, copied)).toMatchObject({
      source: { decision: 'revise', iteration: 1 },
      lineage: { judged: GRADE, adoptedFrom: GRADE },
    });
  });

  it('[QL-43] hashes the goal bare: what a recall appended is not part of what the run was asked', () => {
    const trace = escalatedAfterJudged();
    const remembered = {
      ...trace,
      contract: {
        ...trace.contract,
        goal: `design a link shortener\n\n${MEMORY_HEADING}\n\n- [m1] a lesson`,
      },
    };
    const source: QualityRunDto = {
      ...childRun('system-design-canvas', remembered),
      trace: remembered,
    };
    expect(originOf(source, remembered).lineage.goalHash).toBe(
      contentHash('design a link shortener'),
    );
  });

  it('[QL-35] is what every stored chunk of the run says, so a curator reads the judged iteration’s decision', async () => {
    const trace = escalatedAfterJudged();
    const source: QualityRunDto = { ...childRun('system-design-canvas', trace), trace };
    const ports = memoryPorts();
    const written = await indexMemories(
      ports,
      source,
      {
        digestRunId: 'digest-run',
        memories: [
          {
            position: 1,
            insight: 'Name the queue a write survives a crash in.',
            appliesWhen: 'a click counter must not lose counts on a crash',
            evidence: [],
            iterations: [],
          },
        ],
      },
      'fake-embedding',
    );
    expect(written).toMatchObject({ status: 'complete', counts: { chunks: 1 } });
    const stored = [...(ports.store as InMemoryMemoryStore).points.values()].filter(
      (chunk) => chunk.source.runId === source.runId,
    );
    expect(stored.map((chunk) => [chunk.source.decision, chunk.source.iteration])).toEqual([
      ['revise', 2],
    ]);
    // The lineage is on the stored point, beside the source the curator sees.
    expect(stored[0].lineage).toEqual({
      judged: { runId: source.runId, iteration: 2 },
      adoptedFrom: null,
      goalHash: contentHash('design a link shortener'),
    });
  });

  it('[QL-54] stamps each memory with the iteration its evidence ends in and that iteration’s decision, not the run’s best', async () => {
    // The measured case: a lesson resting on what iteration 1 found and
    // iteration 2 resolved was stamped with the run's best, iteration 3.
    const trace = escalatedAfterJudged();
    const [first, second] = trace.iterations;
    const graded: RunTrace = {
      ...trace,
      iterations: [
        { ...first, mode: 'adopted' },
        { ...second, decision: { ...second.decision, finalDecision: 'retry' } },
        trace.iterations[2],
      ],
    };
    const source: QualityRunDto = {
      ...childRun('system-design-canvas', graded),
      request: { ...childRun('system-design-canvas', graded).request, adoptedFrom: GRADE },
      trace: graded,
    };

    // Resting on the adopted iteration alone: its decision, judged by the grade it copied.
    expect(originOf(source, graded, [1])).toMatchObject({
      source: { iteration: 1, decision: 'revise' },
      lineage: { judged: GRADE, adoptedFrom: GRADE },
    });
    // Resting on a change that ends in iteration 2: iteration 2's own decision and judges.
    expect(originOf(source, graded, [1, 2])).toMatchObject({
      source: { iteration: 2, decision: 'retry' },
      lineage: { judged: { runId: source.runId, iteration: 2 }, adoptedFrom: GRADE },
    });
    // Citing nothing the run can name: the best, as before.
    expect(originOf(source, graded, [9]).source.iteration).toBe(graded.bestIteration);

    const ports = memoryPorts();
    const lesson = (position: number, iterations: number[]) => ({
      position,
      insight: `Lesson ${position}: name the queue a write survives a crash in.`,
      appliesWhen: 'a click counter must not lose counts on a crash',
      evidence: [],
      iterations,
    });
    await indexMemories(
      ports,
      source,
      { digestRunId: 'digest-run', memories: [lesson(1, [1]), lesson(2, [1, 2])] },
      'fake-embedding',
    );
    const stored = [...(ports.store as InMemoryMemoryStore).points.values()]
      .filter((chunk) => chunk.source.runId === source.runId)
      .sort((a, b) => a.source.ref.localeCompare(b.source.ref));
    expect(
      stored.map((chunk) => [
        chunk.source.ref,
        chunk.source.iteration,
        chunk.source.decision,
        chunk.lineage?.judged,
      ]),
    ).toEqual([
      ['memory.1', 1, 'revise', GRADE],
      ['memory.2', 2, 'retry', { runId: source.runId, iteration: 2 }],
    ]);
  });
});
