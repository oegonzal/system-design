import type { IterationTrace } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { teachesNothingNew } from '../../core/outputs';
import { fromRun } from './from-run';
import {
  DIGEST_RULES,
  MAX_MEMORIES,
  experienceRecordSchema,
  readIndex,
  renderGoal,
  type ExperienceRecord,
} from './input';
import { PERSISTED_KEY, RESOLVED_KEY, sampleIterations, sampleRun } from './testing';

const traceOf = (run: ReturnType<typeof sampleRun>) => {
  if (run.trace === null) throw new Error('the sample run carries a trace');
  return run.trace;
};

describe('the experience-digest record', () => {
  it('[QL-15] is the engine’s reduction of the run plus what this codec’s stages read', () => {
    const record = fromRun(sampleRun());
    expect(record).not.toBeNull();
    if (record === null) return;

    // The facts are `core/outputs`': what this codec adds is the rules that
    // travel with them and how many memories the producer may propose.
    expect(record.rules).toEqual([...DIGEST_RULES]);
    expect(record.maxMemories).toBe(MAX_MEMORIES);
    expect(experienceRecordSchema.safeParse(record).success).toBe(true);

    const own = fromRun(sampleRun(), { rules: ['Only what the record shows.'], maxMemories: 3 });
    expect(own?.rules).toEqual(['Only what the record shows.']);
    expect(own?.maxMemories).toBe(3);

    // A run with nothing settled composes nothing, rules or no rules.
    expect(fromRun(sampleRun({ status: 'running', trace: null }))).toBeNull();
  });
});

/** An iteration that produced nothing: no artifact, nothing judged, nothing confirmed. */
const lost = (iteration: IterationTrace, number: number): IterationTrace => ({
  ...iteration,
  iteration: number,
  artifact: null,
  rendered: null,
  critics: [],
  evaluators: [],
  ledger: { ...iteration.ledger, artifactPresent: false, criteria: [], findings: [] },
});

const adopting = (first: IterationTrace): IterationTrace => ({ ...first, mode: 'adopted' });

/** The record of the sample run over these iterations; it must compose. */
const recordOver = (
  iterations: IterationTrace[],
  rest: Partial<ReturnType<typeof traceOf>> = {},
): ExperienceRecord => {
  const run = sampleRun();
  const record = fromRun({ ...run, trace: { ...traceOf(run), iterations, ...rest } });
  if (record === null) throw new Error('the run must compose');
  return record;
};

describe('a run that adopted an earlier run’s iteration', () => {
  it('[QL-61] teaches nothing new when the adopted iteration is the only one with an artifact, as the measured siblings went', () => {
    const run = sampleRun();
    const [first, second] = sampleIterations();
    // Iteration 1 adopted from a grade, iteration 2 produced nothing: every judged row is the grade's.
    expect(
      teachesNothingNew({
        ...traceOf(run),
        iterations: [adopting(first), lost(second, 2)],
        bestIteration: 1,
        lessons: [],
      }),
    ).toBe(true);
    // A revision of its own was produced and judged: that is this run's evidence.
    expect(teachesNothingNew({ ...traceOf(run), iterations: [adopting(first), second] })).toBe(
      false,
    );
    // Nothing adopted is nothing copied, whatever else the run lacked.
    expect(teachesNothingNew(traceOf(run))).toBe(false);
    expect(
      teachesNothingNew({ ...traceOf(run), iterations: [lost(first, 1)], bestIteration: 1 }),
    ).toBe(false);
  });

  it('[QL-61] keeps an adopted finding only for what this run changed, marked so; one it never changed is counted out', () => {
    const [first, second] = sampleIterations();

    // The revision was judged, so the engine recorded what became of every adopted finding.
    const revised = recordOver([adopting(first), second]);
    expect(revised.omitted.adopted).toBe(0);
    expect(revised.findings.map((finding) => [finding.key, finding.adopted])).toEqual([
      [RESOLVED_KEY, true],
      // Seen again in the revision: this run's judges confirmed it too.
      [PERSISTED_KEY, false],
    ]);
    const goal = renderGoal(revised);
    expect(goal).toContain(
      '· seen i1 · adopted from an earlier run · remediated · resolved i1→i2 (the finding did not recur)',
    );
    expect(goal).not.toContain('seen only in an iteration adopted');

    // A lost revision between the copy and the next judged one: no transition spans it.
    const across = recordOver([adopting(first), lost(second, 2), { ...second, iteration: 3 }], {
      bestIteration: 3,
      lessons: [],
    });
    expect(across.findings.map((finding) => [finding.alias, finding.key, finding.adopted])).toEqual(
      [['f1', PERSISTED_KEY, false]],
    );
    expect(across.omitted).toEqual({ findings: 0, criteria: 0, adopted: 1 });
    const rendered = renderGoal(across);
    expect(readIndex(rendered)?.evidence.map((item) => item.alias)).toEqual(['f1', 'r1', 'r2']);
    expect(rendered).toContain(
      '(1 more findings omitted: seen only in an iteration adopted from an earlier run, with no change this run judged)',
    );
  });
});
