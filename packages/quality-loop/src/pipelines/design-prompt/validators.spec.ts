import { DESIGN_PROMPT_SCENARIO_BOUND, type DesignPromptDraft } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import type { TaskContract } from '../../core/contracts';
import { DESIGN_PROMPT } from './definition';
import { sampleDraft, sampleExperienceGoal } from './testing';
import { shapeValidator } from './validators';

const contract = (): TaskContract<DesignPromptDraft> => ({
  ...DESIGN_PROMPT.task,
  goal: sampleExperienceGoal(),
  criteria: [],
});

const problems = (artifact: DesignPromptDraft) =>
  shapeValidator.validate(artifact, contract()).problems;

describe('the design-prompt shape validator', () => {
  it('[QL-3] a draft with every section passes, and the validator only warns', () => {
    expect(problems(sampleDraft())).toEqual([]);
    expect(shapeValidator.gate).toBe('warn');
  });

  it('[QL-3] a draft missing what a grader needs is told so, every gap at once', () => {
    const empty = sampleDraft({
      title: ' ',
      scenario: '',
      functionalRequirements: [],
      nonFunctionalRequirements: [],
      scale: [],
    });
    expect(problems(empty).map((problem) => problem.message)).toEqual([
      'the prompt has no title',
      'the prompt has no scenario',
      'the prompt states no functional requirement',
      'the prompt states no quality target',
      'the prompt states no scale target',
    ]);
  });

  it('[QL-3] a target without a figure is located at its row', () => {
    // An empty target fails the schema outright; a blank one passes it and is this validator's to name.
    const draft = sampleDraft();
    draft.nonFunctionalRequirements[1] = { ...draft.nonFunctionalRequirements[1], target: ' ' };
    draft.scale[0] = { ...draft.scale[0], target: '  ' };
    expect(problems(draft)).toEqual([
      {
        severity: 'medium',
        locationRefs: ['nfr.2'],
        message: 'quality target 2 has no target figure',
      },
      {
        severity: 'medium',
        locationRefs: ['scale.1'],
        message: 'scale row 1 has no target figure',
      },
    ]);
  });

  it('[QL-3] an ill-formed artifact is left to the schema validator', () => {
    expect(problems({ title: 3 } as unknown as DesignPromptDraft)).toEqual([]);
  });

  it('[QL-47] a scenario past its ceiling hides no gap: the draft is read whole, as the seam read it', () => {
    const draft = sampleDraft({
      scenario: 'x'.repeat(DESIGN_PROMPT_SCENARIO_BOUND.ceiling + 200),
      scale: [],
    });
    expect(DESIGN_PROMPT.task.output.schema.safeParse(draft).success).toBe(false);
    expect(problems(draft).map((problem) => problem.message)).toEqual([
      'the prompt states no scale target',
    ]);
  });
});
