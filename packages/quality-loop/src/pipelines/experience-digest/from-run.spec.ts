import { describe, expect, it } from 'vitest';

import { DIGEST_RULES, MAX_MEMORIES, experienceRecordSchema } from './input';
import { fromRun } from './from-run';
import { sampleRun } from './testing';

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
