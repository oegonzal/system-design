import { bound, bounded, type Withholding } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  confirmed,
  fill,
  ledger,
  tinyPipeline,
  tinyPolicy,
  traceOf,
  type TinyOutput,
} from '../testing';
import { outputsOf } from './run-outputs';
import {
  withheldItems,
  withheldOf,
  withholdingOf,
  WITHHOLD_EVERY_REF,
  type WithholdingRules,
} from './withheld';

const ITEMS = ['memory.1', 'memory.2', 'memory.3', 'memory.4'];

/** A finding of `type` naming `refs` — the key as the engine builds it. */
const naming = (type: string, refs: string[]) =>
  confirmed({ key: `${type}|${[...refs].sort().join(',')}`, type, locationRefs: refs });

/** Rules declaring each type's withholding, as a policy's `findingTypes` would. */
const declaring = (table: Record<string, Withholding>): WithholdingRules =>
  withholdingOf({
    policy: {
      findingTypes: Object.fromEntries(
        Object.entries(table).map(([type, withholds]) => [
          type,
          { dimension: 'any', gate: false, withholds },
        ]),
      ),
    },
    validators: [],
  });

describe('withheldItems', () => {
  it('[QL-53] an undeclared finding withholds every item it names — the rule before any was declared', () => {
    const faulted = ledger({ findings: [naming('wrong', ['memory.2', 'memory.3', 'summary'])] });
    const withheld = withheldItems(faulted, ITEMS);
    expect(withheld).toEqual([
      { ref: 'memory.2', source: 'finding', by: 'wrong', note: null },
      { ref: 'memory.3', source: 'finding', by: 'wrong', note: null },
    ]);
    // Only the reader's items are ever withheld: `summary` is not one.
    expect(withheldItems(faulted, ITEMS, WITHHOLD_EVERY_REF)).toEqual(withheld);
  });

  it('[QL-53] a finding whose remedy is a rewrite names every item and withholds none', () => {
    // The live case: one medium finding saw a template across all six
    // memories, named every one, and an accepted digest stored nothing.
    const pattern = naming('vague_condition', ITEMS);
    expect(withheldItems(ledger({ findings: [pattern] }), ITEMS)).toHaveLength(ITEMS.length);
    expect(
      withheldItems(ledger({ findings: [pattern] }), ITEMS, declaring({ vague_condition: 'none' })),
    ).toEqual([]);
  });

  it('[QL-53] a finding declared to withhold when it requires the user withholds what it names only when its judge marks it so', () => {
    // Measured 2026-10-13: an overstated finding marked requires_user doubted the value — a skill asked of a
    // hedged "it or one comparable", a figure typed to answer a yes-or-no — and one marked fixable_local only
    // its label; both withheld nothing, and the doubted values were typed into live forms.
    const doubted = confirmed({
      key: 'overstated|memory.1',
      type: 'overstated',
      locationRefs: ['memory.1'],
      fixability: 'requires_user',
    });
    const relabelled = confirmed({
      key: 'overstated|memory.2',
      type: 'overstated',
      locationRefs: ['memory.2'],
      fixability: 'fixable_local',
    });
    const rules = declaring({ overstated: 'every-ref-when-requires-user' });
    expect(withheldItems(ledger({ findings: [doubted, relabelled] }), ITEMS, rules)).toEqual([
      { ref: 'memory.1', source: 'finding', by: 'overstated', note: null },
    ]);
    expect(withheldItems(ledger({ findings: [relabelled] }), ITEMS, rules)).toEqual([]);
  });

  it('[QL-53] a validator problem naming an item withholds it as its validator declares, every ref when it declares nothing', () => {
    const warned = ledger({
      validation: [
        {
          validatorId: 'run-specificity',
          gate: 'warn',
          problems: [{ severity: 'low', locationRefs: ['memory.4'], message: 'names the run' }],
        },
        // A problem that names no item — a size warning — withholds nothing.
        {
          validatorId: 'bounds',
          gate: 'warn',
          problems: [{ severity: 'info', locationRefs: [], message: 'long' }],
        },
      ],
    });
    expect(withheldItems(warned, ITEMS)).toEqual([
      { ref: 'memory.4', source: 'validator', by: 'run-specificity', note: 'names the run' },
    ]);
    // Read off the definition's validators, each declaring on itself — one that
    // says nothing is left to the strict default.
    const rules = withholdingOf({
      policy: { findingTypes: {} },
      validators: [{ id: 'run-specificity', withholds: 'none' }, { id: 'references' }],
    });
    expect(rules.validators).toEqual({ 'run-specificity': 'none' });
    expect(withheldItems(warned, ITEMS, rules)).toEqual([]);
  });
});

describe('withheldOf', () => {
  const ARTIFACT: TinyOutput = { text: 'a draft', parts: ['first', 'second'] };
  const TEXT = bound(40);

  /** A run whose best iteration holds `artifact`, with a `wrong` finding naming its second part and a location it lacks. */
  const judged = (artifact: unknown) =>
    outputsOf(
      traceOf({ artifact, ledger: ledger({ findings: [naming('wrong', ['part.2', 'summary'])] }) }),
    );

  it('[QL-53] withholds, of the best artifact’s own locations, what the pipeline’s definition declares', () => {
    // The tiny pipeline's `wrong` declares nothing, so every location it names that the artifact has is withheld.
    expect(withheldOf(tinyPipeline(), judged(ARTIFACT))).toEqual([
      { ref: 'part.2', source: 'finding', by: 'wrong', note: null },
    ]);
    const policy = tinyPolicy();
    const declared = tinyPipeline({
      policy: {
        ...policy,
        findingTypes: {
          ...policy.findingTypes,
          wrong: { dimension: 'form', gate: false, withholds: 'none' },
        },
      },
    });
    expect(withheldOf(declared, judged(ARTIFACT))).toEqual([]);
  });

  it('[QL-53] reads the best artifact as a caller does — a text a little past its bound is kept, and what was named in it is still withheld — and withholds nothing where no artifact reads', () => {
    const tiny = tinyPipeline();
    const capped = tinyPipeline({
      task: {
        ...tiny.task,
        output: {
          ...tiny.task.output,
          schema: z.strictObject({ text: bounded.text(TEXT), parts: z.array(z.string()) }),
        },
      },
    });
    const overrun = { ...ARTIFACT, text: fill(TEXT.ceiling + 10) };
    expect(withheldOf(capped, judged(overrun))).toEqual([
      { ref: 'part.2', source: 'finding', by: 'wrong', note: null },
    ]);
    // No iteration crowned, a best that produced nothing, or one its schema refuses: no location to withhold.
    expect(withheldOf(capped, outputsOf(traceOf({ iterations: 0 })))).toEqual([]);
    expect(withheldOf(capped, judged(null))).toEqual([]);
    expect(withheldOf(capped, judged({ text: 'a draft' }))).toEqual([]);
  });
});
