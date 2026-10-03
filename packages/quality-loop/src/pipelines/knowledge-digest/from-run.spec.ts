import type { IterationTrace } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { sampleIterations, sampleRun } from '../../core/testing';
import { fromRun } from './from-run';
import { MAX_KNOWN, MAX_LOCATION_IDS, heldThroughout } from './input';
import { sampleKnown, sampleSource } from './testing';

const traceOf = (run: ReturnType<typeof sampleRun>) => {
  if (run.trace === null) throw new Error('the sample run carries a trace');
  return run.trace;
};

describe('composing a knowledge record from a finished run', () => {
  it('[QL-42] carries the source policy, what is known under engine aliases, and the judged artifact’s own places', () => {
    const record = fromRun(sampleRun(), sampleSource(), {
      known: [sampleKnown(), sampleKnown({ ref: 'memory.5', kind: 'fact' })],
    });
    expect(record).not.toBeNull();
    if (record === null) return;

    expect(record.source).toEqual({ pipeline: 'system-design', version: '1.0.0' });
    expect(record.dimensions).toEqual(['completeness', 'soundness', 'compliance']);
    // Aliases are the engine's, by the position the recall handed them over in.
    expect(record.known.map((item) => [item.alias, item.kind, item.ref])).toEqual([
      ['k1', 'lesson', 'memory.2'],
      ['k2', 'fact', 'memory.5'],
    ]);
    // The places of the iteration the digest reasons about, not of every iteration.
    expect(record.locationIds).toEqual(['summary', 'component.1', 'flow.1']);
    expect(record.omitted).toEqual({ findings: 0, criteria: 0, locations: 0 });
    expect(record.maxMemories).toBe(12);
  });

  it('[QL-42] a criterion held only when every iteration that judged it passed it', () => {
    const [first, second] = sampleIterations();
    // c2 passes in both iterations; c1 is partial then pass.
    expect(
      fromRun(sampleRun(), sampleSource())?.criteria.map((criterion) => [
        criterion.id,
        heldThroughout(criterion),
      ]),
    ).toEqual([
      ['c1', false],
      ['c2', true],
    ]);

    // An iteration that judged nothing leaves the criterion unassessed, which is
    // neither a pass nor a failure to hold: c2 still held, on the strength of
    // the one iteration that judged it.
    const silent = (iteration: IterationTrace): IterationTrace => ({
      ...iteration,
      ledger: { ...iteration.ledger, criteria: [] },
    });
    const run = sampleRun();
    const partly = fromRun(
      { ...run, trace: { ...traceOf(run), iterations: [first, silent(second)] } },
      sampleSource(),
    );
    expect(partly?.criteria.map((criterion) => heldThroughout(criterion))).toEqual([false, true]);

    // A criterion no iteration ever judged held nothing: there is no pass to rest on.
    const never = fromRun(
      { ...run, trace: { ...traceOf(run), iterations: [silent(first), silent(second)] } },
      sampleSource(),
    );
    expect(never?.criteria.map((criterion) => heldThroughout(criterion))).toEqual([false, false]);
  });

  it('[QL-42] known items and places are bounded, and what the caps dropped is counted', () => {
    const many = Array.from({ length: MAX_KNOWN + 4 }, (_, index) =>
      sampleKnown({ ref: `memory.${index + 1}` }),
    );
    const record = fromRun(sampleRun(), sampleSource(), { known: many });
    expect(record?.known).toHaveLength(MAX_KNOWN);
    expect(record?.known.at(-1)?.alias).toBe(`k${MAX_KNOWN}`);

    const run = sampleRun();
    const [first, second] = sampleIterations();
    const crowded: IterationTrace = {
      ...second,
      locations: Array.from({ length: MAX_LOCATION_IDS + 7 }, (_, index) => ({
        id: `node.${index + 1}`,
        label: 'a node',
      })),
    };
    const wide = fromRun(
      { ...run, trace: { ...traceOf(run), iterations: [first, crowded] } },
      sampleSource(),
    );
    expect(wide?.locationIds).toHaveLength(MAX_LOCATION_IDS);
    expect(wide?.omitted.locations).toBe(7);
  });

  it('[QL-42] a long known lesson is shown short rather than refused, and a run with nothing settled is nothing yet', () => {
    const long = sampleKnown({ text: 'x'.repeat(2_000) });
    const record = fromRun(sampleRun(), sampleSource(), { known: [long] });
    expect(record?.known[0].text).toHaveLength(600);
    expect(record?.known[0].text.endsWith('…')).toBe(true);

    expect(fromRun(sampleRun({ status: 'running', trace: null }), sampleSource())).toBeNull();
    const run = sampleRun();
    expect(
      fromRun(
        { ...run, status: 'running', trace: { ...traceOf(run), stopReason: null } },
        sampleSource(),
      ),
    ).toBeNull();
  });
});
