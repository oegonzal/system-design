import { DOCUMENT_MEMORY_KINDS, type QualityRunDto, type RunTrace } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { InMemoryMemoryStore, vectorOf } from '../../../modules/memory/testing';
import { pointId } from '../../../modules/memory/qdrant/collection';
import type { StoredChunk } from '../ports';
import { childRun, memoryPorts } from '../steps.testing';
import { FAKE_MODEL, readoutTrace } from '../testing';
import { DEFAULT_CHUNK_KIND, type OwnedKinds } from './chunks';
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
      [DEFAULT_CHUNK_KIND],
    );
    expect(written).toMatchObject({ status: 'complete', counts: { chunks: 1 } });
    const stored = [...(ports.store as InMemoryMemoryStore).points.values()].filter(
      (chunk) => chunk.source.runId === source.runId,
    );
    expect(stored.map((chunk) => [chunk.source.decision, chunk.source.iteration])).toEqual([
      ['revise', 2],
    ]);
  });

  it('[QL-41] replaces every kind the writer owns, so a re-digest that drops one does not orphan its point', async () => {
    const trace = escalatedAfterJudged();
    const source: QualityRunDto = { ...childRun('system-design-canvas', trace), trace };
    const ports = memoryPorts();
    const store = ports.store as InMemoryMemoryStore;
    const owned: OwnedKinds = [DEFAULT_CHUNK_KIND, ...DOCUMENT_MEMORY_KINDS];
    const memory = (position: number, kind: string) => ({
      position,
      insight: `insight ${position}`,
      appliesWhen: `when ${position}`,
      evidence: [],
      kind,
    });
    const kindsNow = () =>
      [...store.points.values()]
        .filter((chunk) => chunk.source.runId === source.runId)
        .map((chunk) => [chunk.source.kind, chunk.source.ref])
        .sort();

    // A first digest writes two kinds under this source run.
    await indexMemories(
      ports,
      source,
      { digestRunId: 'd1', memories: [memory(1, 'profile_fact'), memory(2, 'profile_story')] },
      FAKE_MODEL,
      owned,
    );
    expect(kindsNow()).toEqual([
      ['profile_fact', 'memory.1'],
      ['profile_story', 'memory.2'],
    ]);

    // A second digest of the same document proposes only the first. Scoping the
    // replace to the kinds this run WROTE would leave the story standing beside
    // it for ever: a point id carries no kind, so nothing overwrites a position
    // the new digest does not reach, and the delete must cover it instead.
    await indexMemories(
      ports,
      source,
      { digestRunId: 'd2', memories: [memory(1, 'profile_fact')] },
      FAKE_MODEL,
      owned,
    );
    expect(kindsNow()).toEqual([['profile_fact', 'memory.1']]);
  });

  it('[QL-41] replaces the run’s lessons and leaves another writer’s kinds under the same run standing', async () => {
    const trace = escalatedAfterJudged();
    const source: QualityRunDto = { ...childRun('system-design-canvas', trace), trace };
    const ports = memoryPorts();
    const store = ports.store as InMemoryMemoryStore;

    // What another writer keeps under the same source run: an item of its own
    // kind, and a lesson of an earlier digest of this run that this one drops.
    const foreign = (ref: string, kind: StoredChunk['source']['kind']): StoredChunk => ({
      text: `${kind} ${ref}`,
      keys: { condition: `when ${ref}`, lesson: `${kind} ${ref}` },
      contentHash: `${'0'.repeat(63)}${kind === 'fact' ? '1' : '2'}`,
      source: {
        runId: source.runId,
        pipeline: 'knowledge-digest',
        kind,
        ref,
        decision: 'revise',
        iteration: 2,
        when: '2026-10-02',
      },
      evidence: [],
      digestRunId: 'knowledge-digest-run',
      model: FAKE_MODEL,
      vectors: { condition: vectorOf(`when ${ref}`), lesson: vectorOf(`${kind} ${ref}`) },
    });
    store.points.set(pointId(source.runId, 'knowledge.1'), foreign('knowledge.1', 'fact'));
    store.points.set(pointId(source.runId, 'finding.1'), foreign('finding.1', 'finding'));
    store.points.set(pointId(source.runId, 'memory.9'), {
      ...foreign('memory.9', 'lesson'),
      source: { ...foreign('memory.9', 'lesson').source, pipeline: 'system-design-canvas' },
    });

    await indexMemories(
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
      FAKE_MODEL,
      [DEFAULT_CHUNK_KIND],
    );

    const mine = [...store.points.values()].filter((chunk) => chunk.source.runId === source.runId);
    expect(mine.map((chunk) => [chunk.source.kind, chunk.source.ref]).sort()).toEqual([
      ['fact', 'knowledge.1'],
      ['finding', 'finding.1'],
      ['lesson', 'memory.1'],
    ]);
  });
});
