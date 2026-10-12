import type { Withholding } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { confirmed, ledger } from '../testing';
import {
  withheldItems,
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
