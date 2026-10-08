import { GOAL_BUDGET_BYTES, textBytes } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { sampleRun } from '../../core/testing';
import { fit, fromRun } from './from-run';
import { KNOWN_HEADING, knowledgeRecordSchema, readIndex, renderGoal, vocabularyOf } from './input';
import { maximalRecord, sampleKnown, sampleSource } from './testing';

const compose = (known = [sampleKnown()]) => {
  const record = fromRun(sampleRun(), sampleSource(), { known });
  if (record === null) throw new Error('the sample run must compose');
  return record;
};

describe('the knowledge-digest input codec', () => {
  it('[QL-14] a composed goal round-trips: the index read back is what a rule needs to check', () => {
    const record = compose();
    const goal = renderGoal(record);
    expect(goal).toContain(record.prompt);
    expect(goal).toContain(record.artifact);

    // Every evidence line carries the dimension its kind lands on, so the
    // producer reads the allowed value beside the evidence rather than guessing.
    expect(goal).toContain('- [r1] functional → completeness');
    expect(goal).toContain('- [r2] constraint → compliance · held throughout');
    expect(goal).toContain('- [f1] unhandled_failure → soundness');
    expect(goal).toContain('- [f2] contradiction → soundness');

    // What is known is shown with its provenance and under its own alias.
    expect(goal).toContain(KNOWN_HEADING);
    expect(goal).toContain('- [k1] lesson · system-design · 2026-09-08 · run');
    expect(goal).toContain('ref memory.2: Give every read path');
    expect(goal).toContain('dimension is exactly one of: completeness, soundness, compliance');

    const index = readIndex(goal);
    expect(index).not.toBeNull();
    if (index === null) return;
    expect(index.pipeline).toBe('knowledge-digest');
    expect(index.source).toEqual({ pipeline: 'system-design', version: '1.0.0' });
    expect(index.iterations).toBe(2);
    expect(index.evidence).toEqual([
      {
        alias: 'f1',
        kind: 'finding',
        ref: 'unhandled_failure|flow.1',
        of: 'unhandled_failure',
        dimension: 'soundness',
        transitions: ['resolved'],
        held: false,
      },
      {
        alias: 'f2',
        kind: 'finding',
        ref: 'contradiction|component.1',
        of: 'contradiction',
        dimension: 'soundness',
        transitions: ['persisted'],
        held: false,
      },
      {
        alias: 'r1',
        kind: 'criterion',
        ref: 'c1',
        of: 'functional',
        dimension: 'completeness',
        transitions: ['improved'],
        held: false,
      },
      {
        alias: 'r2',
        kind: 'criterion',
        ref: 'c2',
        of: 'constraint',
        dimension: 'compliance',
        transitions: [],
        held: true,
      },
    ]);
    expect(index.known).toEqual([
      {
        alias: 'k1',
        kind: 'lesson',
        runId: '2026-09-08T06-53-32-552-09ea0f-quality',
        ref: 'memory.2',
      },
    ]);
    // The artifact's own places, which is what the generality rule checks against.
    expect(index.locations).toEqual(['summary', 'component.1', 'flow.1']);
    expect(vocabularyOf(index)).toEqual({
      evidence: ['f1', 'f2', 'r1', 'r2'],
      known: ['k1'],
      iterations: ['i1', 'i2'],
      locations: ['summary', 'component.1', 'flow.1'],
    });
  });

  it('[QL-14] a run with nothing recalled says so, and a kind the source policy maps nowhere earns no dimension', () => {
    const goal = renderGoal(compose([]));
    expect(goal).toContain('(none recalled — every item here is new to the store)');

    const unmapped = fromRun(
      sampleRun(),
      sampleSource({ map: { criterionKinds: {}, findingTypes: {} } }),
    );
    expect(unmapped).not.toBeNull();
    const unmappedGoal = renderGoal(unmapped as NonNullable<typeof unmapped>);
    expect(unmappedGoal).toContain('- [r1] functional → no dimension');
    expect(readIndex(unmappedGoal)?.evidence.every((item) => item.dimension === null)).toBe(true);
  });

  it('[QL-14] a plain prompt, a foreign index or a broken fence reads as no index', () => {
    expect(readIndex('# Prompt — Serve an order history\n\nJust a prompt.')).toBeNull();
    expect(
      readIndex(
        '## Index\n\n```json\n{"pipeline":"experience-digest","maxMemories":8,"evidence":[]}\n```',
      ),
    ).toBeNull();
    expect(readIndex('## Index\n\n```json\n{ not json')).toBeNull();
  });

  it('[QL-14] the schema is the byte budget, and fitting drops a known item before any evidence', () => {
    const record = maximalRecord();
    const refused = knowledgeRecordSchema.safeParse(record);
    expect(refused.success).toBe(false);
    expect(JSON.stringify(refused.error?.issues)).toContain('beyond the goal budget');

    const fitted = fit(record);
    expect(knowledgeRecordSchema.safeParse(fitted).success).toBe(true);
    expect(textBytes(renderGoal(fitted))).toBeLessThanOrEqual(GOAL_BUDGET_BYTES);
    // A record at every cap needs more than its context: the known items go
    // first and in full, and whatever evidence follows them is counted, never
    // silently dropped.
    expect(fitted.known).toHaveLength(0);
    expect(fitted.findings.length + fitted.omitted.findings).toBe(
      record.findings.length + record.omitted.findings,
    );
    expect(fitted.criteria.length + fitted.omitted.criteria).toBe(
      record.criteria.length + record.omitted.criteria,
    );
    // Places are never trimmed: dropping one would quietly stop checking it.
    expect(fitted.locationIds).toHaveLength(record.locationIds.length);

    // The order, on a record that needs exactly one trim. Context goes before
    // evidence: a dropped known item costs at most a delta a later run can
    // recall again, where a dropped finding is gone for good.
    const small = compose([sampleKnown(), sampleKnown({ ref: 'memory.3' })]);
    const tight = fit(small, textBytes(renderGoal(small)) - 10);
    expect(tight.known).toHaveLength(1);
    expect(tight.findings).toHaveLength(small.findings.length);
    expect(tight.criteria).toHaveLength(small.criteria.length);
    expect(tight.omitted).toEqual(small.omitted);

    expect(knowledgeRecordSchema.safeParse(compose()).success).toBe(true);
  });
});
