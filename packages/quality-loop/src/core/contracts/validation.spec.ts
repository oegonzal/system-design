import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { Validator } from '../ports';
import type { TaskContract } from './task';
import { asWarning, indexedValidator, problem } from './validation';

const schema = z.object({ items: z.array(z.string()) });
type Artifact = z.infer<typeof schema>;

/** A blocking rule that faults every item, over a goal whose index is its whole text. */
const blocking: Validator<Artifact> = indexedValidator(
  'every-item',
  (goal) => (goal === '' ? null : goal),
  (artifact) =>
    artifact.items.map((_, position) => problem('medium', 'faulted', [`item.${position + 1}`])),
  [],
);

const contract = { goal: 'index', output: { schema } } as unknown as TaskContract<Artifact>;

describe('a warning validator', () => {
  it('[QL-53] warns on itself and on every report, passes every other field through, and declares what its problems withhold only when told', () => {
    const declared = asWarning(blocking, 'none');
    expect(declared.id).toBe('every-item');
    expect(declared.gate).toBe('warn');
    expect(declared.withholds).toBe('none');
    const report = declared.validate({ items: ['a', 'b'] }, contract);
    expect(report).toEqual({
      validatorId: 'every-item',
      gate: 'warn',
      problems: [
        problem('medium', 'faulted', ['item.1']),
        problem('medium', 'faulted', ['item.2']),
      ],
    });

    // Undeclared, it carries no `withholds` at all, so a reader falls to the strict default.
    const undeclared = asWarning(blocking);
    expect('withholds' in undeclared).toBe(false);
    expect(undeclared.validate({ items: [] }, contract).gate).toBe('warn');
    // The validator it wraps is untouched.
    expect(blocking.gate).toBe('block');
    expect(blocking.validate({ items: ['a'] }, contract).gate).toBe('block');
  });
});
