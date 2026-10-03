import { describe, expect, it } from 'vitest';

import { sampleRun } from '../../../core/testing';
import { describePipeline } from '../../../core/pipeline';
import { SYSTEM_DESIGN } from '../../../pipelines/system-design/definition';
import { originOf } from '../../memory/store/index-memories';
import type { KnowledgeToStore } from '../digest/read-knowledge-digest';
import { dimensionMapOf, findingChunks, itemChunks, judgedCriteria, transitionOf } from './chunks';

const traceOf = () => {
  const run = sampleRun();
  if (run.trace === null) throw new Error('the sample run carries a trace');
  return run.trace;
};

const dimensions = () => dimensionMapOf(describePipeline(SYSTEM_DESIGN as never).policy);

const item = (overrides: Partial<KnowledgeToStore> = {}): KnowledgeToStore => ({
  position: 1,
  insight: 'Name a durable queue between an unreliable upstream and the read path.',
  appliesWhen: 'a functional requirement is served from data an unreliable system provides',
  evidence: [
    { kind: 'finding', ref: 'unhandled_failure|flow.1' },
    { kind: 'criterion', ref: 'c1' },
  ],
  kind: 'procedure',
  polarity: 'do',
  dimension: 'soundness',
  topics: ['upstream-outage'],
  confirms: [],
  contradicts: [],
  storable: true,
  ...overrides,
});

describe('the chunks a knowledge run writes', () => {
  it('[QL-43] an item is addressed by its position, indexed by both halves, and faceted from the engine’s own record', () => {
    const trace = traceOf();
    const run = sampleRun();
    const [chunk] = itemChunks(
      [item()],
      originOf(run, trace),
      trace,
      dimensions(),
      'digest-run',
      'fake-embedding',
    );
    expect(chunk.source).toMatchObject({
      runId: run.runId,
      pipeline: 'system-design',
      kind: 'procedure',
      ref: 'knowledge.1',
      // The judged iteration's own decision, not the run's final one.
      decision: 'accept',
      iteration: 2,
    });
    expect(chunk.keys.lesson).toBe(item().insight);
    expect(chunk.keys.condition).toBe(item().appliesWhen);
    expect(chunk.text).toBe(`${item().insight} — applies when ${item().appliesWhen}`);
    expect(chunk.digestRunId).toBe('digest-run');
    // Facets are derived: the finding's type and the criterion's kind decide the
    // dimension, the engine's lessons decide the transition, the kind the polarity.
    expect(chunk.facets).toEqual({
      polarity: 'do',
      dimension: 'soundness',
      topics: ['upstream-outage'],
      criterionKinds: ['functional'],
      findingTypes: ['unhandled_failure'],
      transition: 'resolved',
      grounding: 'proven',
    });
  });

  it('[QL-43] a dimension the evidence does not earn is replaced by one it does', () => {
    const trace = traceOf();
    const [chunk] = itemChunks(
      [item({ dimension: 'compliance' })],
      originOf(sampleRun(), trace),
      trace,
      dimensions(),
      'digest-run',
      'fake-embedding',
    );
    // What a search filters on is a fact about the evidence, not a model's word.
    expect(chunk.facets?.dimension).toBe('soundness');
  });

  it('[QL-43] a finding becomes a chunk in the register the engine recorded it in, with no model call', () => {
    const trace = traceOf();
    const chunks = findingChunks(
      trace,
      originOf(sampleRun(), trace),
      dimensions(),
      'fake-embedding',
    );
    // The judged iteration's ledger: the one finding that persisted.
    expect(chunks).toHaveLength(1);
    const [chunk] = chunks;
    expect(chunk.source.kind).toBe('finding');
    expect(chunk.source.ref).toBe('finding.1');
    expect(chunk.keys.lesson).toBe('contradiction (medium)');
    // The condition is what the defect weakened; this finding weakened nothing,
    // so the defect stands in for it — an empty indexed text would lose the batch.
    expect(chunk.keys.condition).toBe('contradiction (medium)');
    expect(chunk.evidence).toEqual([{ kind: 'finding', ref: 'contradiction|component.1' }]);
    expect(chunk.digestRunId).toBeNull();
    expect(chunk.facets).toMatchObject({
      polarity: 'avoid',
      findingTypes: ['contradiction'],
      severity: 'medium',
      transition: 'persisted',
      grounding: 'observed',
    });
  });

  it('[QL-43] a criterion held when every iteration that judged it passed it, and the strongest transition wins', () => {
    const trace = traceOf();
    expect([...judgedCriteria(trace).entries()].map(([id, judged]) => [id, judged.held])).toEqual([
      ['c1', false],
      ['c2', true],
    ]);
    expect(transitionOf(trace.lessons, ['unhandled_failure|flow.1'])).toBe('resolved');
    expect(transitionOf(trace.lessons, ['contradiction|component.1'])).toBe('persisted');
    // Resolved outranks persisted when an item rests on both.
    expect(
      transitionOf(trace.lessons, ['contradiction|component.1', 'unhandled_failure|flow.1']),
    ).toBe('resolved');
    expect(transitionOf(trace.lessons, ['nothing'])).toBeNull();
  });
});
