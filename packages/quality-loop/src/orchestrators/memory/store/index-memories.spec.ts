import type { QualityRunDto, RunTrace } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { InMemoryMemoryStore } from '../../../modules/memory/testing';
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

describe('a stored lesson’s origin', () => {
  it('[QL-35] carries the decision and number of the iteration it cites, not the run’s final decision', () => {
    const trace = escalatedAfterJudged();
    const source: QualityRunDto = { ...childRun('system-design-canvas', trace), trace };
    expect(originOf(source, trace)).toMatchObject({
      runId: source.runId,
      pipeline: 'system-design-canvas',
      decision: 'revise',
      iteration: 2,
    });
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
  });
});
