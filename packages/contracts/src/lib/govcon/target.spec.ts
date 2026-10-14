import { isTargetStage, TARGET_CLOSED_STAGE, TARGET_KINDS, TARGET_STAGES } from './vocab';

describe('the target vocabulary', () => {
  it('[GOV-31] gives each kind of target its own stages, in order, every list ending in the one stage that closes a pursuit, and says whether a stage is a kind’s own', () => {
    for (const kind of TARGET_KINDS) {
      const stages: readonly string[] = TARGET_STAGES[kind];
      expect(stages.at(-1)).toBe(TARGET_CLOSED_STAGE);
      expect(new Set(stages).size).toBe(stages.length);
      expect(stages.every((stage) => isTargetStage(kind, stage))).toBe(true);
    }
    // A firm is contacted; an award is watched: neither is the other's stage.
    expect(isTargetStage('firm', 'contacted')).toBe(true);
    expect(isTargetStage('award', 'contacted')).toBe(false);
    expect(isTargetStage('award', 'watching')).toBe(true);
    expect(isTargetStage('firm', 'watching')).toBe(false);
    expect(isTargetStage('firm', 'won')).toBe(false);
  });
});
