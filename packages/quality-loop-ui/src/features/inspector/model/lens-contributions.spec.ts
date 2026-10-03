import { describe, expect, it } from 'vitest';

import { makePipeline, makeRun, makeTwoIterationRun } from '../../../testing/fixtures';
import { deriveRun } from './derive-run';
import { lensContributions } from './lens-contributions';
import { reduceAll } from './reduce';
import { emptyState } from './state';

const stateOf = (run = makeRun()) => reduceAll(emptyState(), deriveRun(run));

describe('what each lens contributed', () => {
  it('[QLU-9] joins every item a sample offered to what the ledger did with it', () => {
    const { critics, evaluators } = lensContributions(stateOf(), makePipeline());
    expect(critics.map((lens) => lens.lens)).toEqual(['critic.requirements']);

    const items = critics[0].samples[0].items;
    expect(items).toHaveLength(3);
    // The first was confirmed and charged to a criterion instead of priced twice.
    // The other two are different defects the sample reported at the same place,
    // and the normaliser merged them into one confirmed finding — so both join
    // the same group, which is what agreement by overlap means.
    expect(items.map((item) => item.fate)).toEqual(['reconciled', 'confirmed', 'confirmed']);
    expect(items[1].kind === 'finding' && items[1].groupKey).toBe('unsupported_claim|summary');
    expect(items[2].kind === 'finding' && items[2].groupKey).toBe('unsupported_claim|summary');
    // Their own keys are equal — the wire gives a model's list no identity — so
    // nothing downstream may key on that alone.
    expect(items[1].kind === 'finding' && items[1].ownKey).toBe(
      items[2].kind === 'finding' ? items[2].ownKey : 'different',
    );
    expect(items[0]).toMatchObject({
      kind: 'finding',
      type: 'missing_requirement',
      groupKey: 'missing_requirement|component.2',
      reconciledTo: 'c2',
      hits: 1,
      lenses: ['critic.requirements'],
    });

    const judged = evaluators[0].samples[0].items;
    expect(judged.map((item) => item.fate)).toEqual(['settled', 'settled']);
    expect(judged[1]).toMatchObject({
      kind: 'result',
      criterionId: 'c2',
      result: 'fail',
      settled: 'fail',
      hits: 1,
    });
  });

  it('[QLU-9] carries the declared bounds and the agreement bar the items had to clear', () => {
    const pipeline = makePipeline({
      policy: {
        ...makePipeline().policy,
        evidence: { ...makePipeline().policy.evidence, minHits: 2 },
      },
    });
    const { critics, evaluators, minHits } = lensContributions(stateOf(), pipeline);
    expect(minHits).toBe(2);
    expect(critics[0].minHits).toBe(2);
    expect(critics[0].declared).toEqual({
      samples: 1,
      maxItems: 12,
      maxTokens: 4000,
      consumes: [],
    });
    // An evaluator also declares which criterion kinds it is asked to judge.
    expect(evaluators[0].declared?.criterionKinds).toEqual(['functional', 'scale']);
  });

  it('[QLU-9] a declared sample with nothing recorded is shown as missing, not skipped', () => {
    // A lost sample is the thing most worth seeing: agreement is counted within
    // one lens, so anything only that sample saw could not clear the bar.
    const pipeline = makePipeline({
      critics: [
        { id: 'critic.requirements', samples: 3, maxItems: 12, maxTokens: 4000, consumes: [] },
      ],
    });
    const { critics } = lensContributions(stateOf(), pipeline);
    expect(critics[0].samples.map((sample) => sample.missing)).toEqual([false, true, true]);
  });

  it('[QLU-9] a lens that produced nothing carries its diagnostic rather than an empty list', () => {
    const run = makeRun();
    const trace = run.trace;
    if (trace === null) throw new Error('fixture has no trace');
    const [iteration] = trace.iterations;
    const state = reduceAll(
      emptyState(),
      deriveRun({
        ...run,
        trace: {
          ...trace,
          iterations: [
            {
              ...iteration,
              critics: [
                {
                  report: null,
                  diagnostic: {
                    stage: 'critic.requirements',
                    sample: 1,
                    reason: 'llm-failed',
                    detail: null,
                  },
                },
              ],
            },
          ],
        },
      }),
    );
    const { critics } = lensContributions(state, makePipeline());
    expect(critics[0].samples[0]).toMatchObject({
      sample: 1,
      items: [],
      diagnostic: { reason: 'llm-failed' },
    });
  });

  it('[QLU-9] a lens the registry does not list is still shown, and said to be undeclared', () => {
    const { critics } = lensContributions(
      stateOf(),
      makePipeline({
        critics: [{ id: 'critic.other', samples: 1, maxItems: 5, maxTokens: 100, consumes: [] }],
      }),
    );
    expect(critics.map((lens) => [lens.lens, lens.declared !== null])).toEqual([
      ['critic.other', true],
      ['critic.requirements', false],
    ]);
  });

  it('[QLU-9] a discard the ledger attributes to a lens that no sample explains is surfaced', () => {
    const run = makeRun();
    const trace = run.trace;
    if (trace === null) throw new Error('fixture has no trace');
    const [iteration] = trace.iterations;
    const state = reduceAll(
      emptyState(),
      deriveRun({
        ...run,
        trace: {
          ...trace,
          iterations: [
            {
              ...iteration,
              ledger: {
                ...iteration.ledger,
                discarded: [
                  {
                    lens: 'critic.requirements',
                    key: 'gap|nowhere',
                    reason: 'below-min-hits',
                    detail: '1 of 2 samples',
                  },
                ],
              },
            },
          ],
        },
      }),
    );
    const { critics } = lensContributions(state, makePipeline());
    expect(critics[0].unexplainedDiscards.map((item) => item.key)).toEqual(['gap|nowhere']);
  });

  it('[QLU-9] a cell an earlier iteration wrote is marked stale, not judged against this ledger', () => {
    // An iteration with no artifact asks no lens anything, so the engine records
    // no reports for it and nothing clears the last iteration's. Joining those
    // against the new ledger badged perfectly accounted-for findings as having
    // no ledger entry — the reports were simply one iteration old.
    const run = makeRun();
    const trace = run.trace;
    if (trace === null) throw new Error('fixture has no trace');
    const [first] = trace.iterations;
    const second = {
      ...first,
      iteration: 2,
      mode: 'revise' as const,
      artifact: null,
      rendered: null,
      locations: [],
      validation: [],
      critics: [],
      evaluators: [],
      ledger: { ...first.ledger, criteria: [], findings: [], discarded: [] },
    };
    const state = reduceAll(
      emptyState(),
      deriveRun({ ...run, trace: { ...trace, iterations: [first, second] } }),
    );
    const { critics } = lensContributions(state, makePipeline());
    const [sample] = critics[0].samples;
    expect(sample).toMatchObject({ iteration: 1, stale: true, items: [] });
    // The first iteration reads normally — nothing is stale against its own ledger.
    const atFirst = reduceAll(emptyState(), deriveRun(run));
    expect(lensContributions(atFirst, makePipeline()).critics[0].samples[0]).toMatchObject({
      stale: false,
    });
  });

  it('[QLU-9] agreement another lens reached is not credited to this one’s sample', () => {
    // Agreement is counted within ONE lens. A group some other lens confirmed is
    // still in the ledger, so a sample that reported the same defect joins it —
    // but saying "confirmed" with that group's hit count would hand this lens
    // credit for a bar it never cleared.
    const run = makeRun();
    const trace = run.trace;
    if (trace === null) throw new Error('fixture has no trace');
    const [iteration] = trace.iterations;
    const state = reduceAll(
      emptyState(),
      deriveRun({
        ...run,
        trace: {
          ...trace,
          iterations: [
            {
              ...iteration,
              ledger: {
                ...iteration.ledger,
                findings: iteration.ledger.findings.map((finding) => ({
                  ...finding,
                  lenses: ['critic.somebody-else'],
                  hits: 2,
                })),
              },
            },
          ],
        },
      }),
    );
    const items = lensContributions(state, makePipeline()).critics[0].samples[0].items;
    expect(items.every((item) => item.kind === 'finding' && item.confirmedElsewhere)).toBe(true);
    // And when this lens IS among the confirmers, it is its own agreement.
    const own = lensContributions(reduceAll(emptyState(), deriveRun(run)), makePipeline());
    expect(
      own.critics[0].samples[0].items.every(
        (item) => item.kind === 'finding' && !item.confirmedElsewhere,
      ),
    ).toBe(true);
  });

  it('[QLU-9] without the registry the declared columns are empty rather than invented', () => {
    const { critics, undeclared, minHits } = lensContributions(stateOf(), null);
    expect(undeclared).toBe(true);
    expect(minHits).toBe(1);
    expect(critics[0].declared).toBeNull();
    // What the lens actually said is still there: only the declaration is missing.
    expect(critics[0].samples[0].items).toHaveLength(3);
  });

  it('[QLU-9] the cells say which iteration wrote them, so a stale sample is visible', () => {
    const { critics } = lensContributions(stateOf(makeTwoIterationRun()), makePipeline());
    expect(critics[0].samples[0].iteration).toBe(2);
  });
});
