import { describe, expect, it } from 'vitest';

import { degradedNote } from './degraded';

describe('degradedNote', () => {
  it('[DEL-4] names each lens sample a grade was computed without, by lens and why, in words', () => {
    expect(degradedNote([{ stage: 'critic.scale', sample: 1, reason: 'llm-failed' }])).toBe(
      'Graded with 1 lens sample missing — critic scale #1 (the model did not answer). The score stands on the lenses that answered.',
    );
    expect(
      degradedNote([
        { stage: 'evaluator.coverage', sample: null, reason: 'llm-artifact-rejected' },
      ]),
    ).toContain('evaluator coverage (its answer did not fit the report)');
  });

  it('says nothing when every lens answered', () => {
    expect(degradedNote([])).toBeNull();
  });
});
