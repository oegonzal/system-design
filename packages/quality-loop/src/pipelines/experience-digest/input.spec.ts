import { describe, expect, it } from 'vitest';

import { GOAL_MAX_BYTES, goalBytes } from '../../core/contracts';
import { fit, fromRun } from './from-run';
import { experienceRecordSchema, readIndex, renderGoal } from './input';
import { maximalRecord, sampleRun } from './testing';

describe('the experience-digest input codec', () => {
  it('[QL-14] a composed goal round-trips: the index read back is the evidence written', () => {
    const record = fromRun(sampleRun());
    if (record === null) throw new Error('the sample run must compose');
    const goal = renderGoal(record);
    expect(goal).toContain(record.prompt);
    expect(goal).toContain(record.artifact);
    expect(goal).toContain('- i2 (revise): accept — overall 86 (+29) — completeness 100 (+50)');
    expect(goal).toContain(
      '- [r1] functional · List orders newest first. — i1 partial → i2 pass — improved i1→i2 (partial → pass)',
    );
    expect(goal).toContain(
      '- [f1] unhandled_failure · high · confidence high · fixable_local · at flow.1 · weakens r1 · by critic.soundness · seen i1 · remediated · resolved i1→i2 (the finding did not recur) — the read path has no story for a POS outage',
    );
    expect(goal).toContain('- [f2] contradiction');
    expect(goal).toContain('not remediated · persisted i1→i2');
    expect(goal).not.toContain('One iteration only');
    expect(readIndex(goal)).toEqual({
      pipeline: 'experience-digest',
      maxMemories: 8,
      evidence: [
        { alias: 'f1', kind: 'finding', ref: 'unhandled_failure|flow.1' },
        { alias: 'f2', kind: 'finding', ref: 'contradiction|component.1' },
        { alias: 'r1', kind: 'criterion', ref: 'c1' },
        { alias: 'r2', kind: 'criterion', ref: 'c2' },
      ],
    });
  });

  it('[QL-14] a plain prompt, a foreign index or a broken fence reads as no index', () => {
    expect(readIndex('# Prompt — Serve an order history\n\nJust a prompt.')).toBeNull();
    expect(
      readIndex(
        '## Index\n\n```json\n{"pipeline":"memory-recall","maxKept":2,"candidates":[]}\n```',
      ),
    ).toBeNull();
    expect(readIndex('## Index\n\n```json\n{ not json')).toBeNull();
  });

  it('[QL-14] the schema is the byte budget: a record that would be clipped is refused, and fitting one trims text before evidence', () => {
    const record = maximalRecord();
    const refused = experienceRecordSchema.safeParse(record);
    expect(refused.success).toBe(false);
    expect(JSON.stringify(refused.error?.issues)).toContain('beyond the goal budget');

    const fitted = fit(record);
    expect(experienceRecordSchema.safeParse(fitted).success).toBe(true);
    const goal = renderGoal(fitted);
    expect(goalBytes(goal)).toBeLessThanOrEqual(GOAL_MAX_BYTES);
    expect(goalBytes(fitted.artifact ?? '')).toBeLessThan(goalBytes(record.artifact ?? ''));
    expect(goalBytes(fitted.prompt)).toBeLessThan(goalBytes(record.prompt));
    expect(fitted.findings.length + fitted.omitted.findings).toBe(
      record.findings.length + record.omitted.findings,
    );
    expect(fitted.criteria.length + fitted.omitted.criteria).toBe(
      record.criteria.length + record.omitted.criteria,
    );
    expect(readIndex(goal)?.evidence).toHaveLength(fitted.findings.length + fitted.criteria.length);
    expect(goal).toContain(`(${fitted.omitted.findings} more findings omitted)`);

    const sample = fromRun(sampleRun());
    expect(sample && experienceRecordSchema.safeParse(sample).success).toBe(true);
  });
});
