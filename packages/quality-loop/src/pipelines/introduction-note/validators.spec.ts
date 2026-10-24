import type { IntroductionNoteOutput } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import type { TaskContract } from '../../core/contracts';
import { INTRODUCTION_NOTE } from './definition';
import { sampleIndex, sampleIntroductionGoal, sampleNote } from './testing';
import { referencesValidator } from './validators';

const contract = (goal = sampleIntroductionGoal()): TaskContract<IntroductionNoteOutput> => ({
  ...INTRODUCTION_NOTE.task,
  goal,
  criteria: [],
});

const messages = (note: IntroductionNoteOutput, goal?: string): string[] =>
  referencesValidator.validate(note, contract(goal)).problems.map((problem) => problem.message);

describe('the introduction-note validators', () => {
  it('[QL-3] the sample passes, and references block', () => {
    expect(messages(sampleNote())).toEqual([]);
    expect(referencesValidator.gate).toBe('block');
  });

  it('[QL-3] [QL-82] a note about another program, an offer the goal never listed, or one offer made twice blocks — read from the index and never from prose', () => {
    const astray = sampleNote({
      programReference: { piid: 'W912DY20D0079' },
      offerLines: [
        ...sampleNote().offerLines,
        { offerId: 'offer.9', line: 'We also do this.' },
        { offerId: 'offer.1', line: 'And this again.' },
      ],
    });
    expect(messages(astray)).toEqual([
      'the note names W912DY20D0079, not the program 47QFCA22F0018',
      'offer.3 makes offer.9, which the goal does not list',
      'offer.4 makes offer.1 a second time',
    ]);
    // The same offers under a goal that lists offer.9 are fine: the prose never decided.
    const wider = sampleIntroductionGoal({
      ...sampleIndex(),
      offerIds: [...sampleIndex().offerIds, 'offer.9'],
    });
    expect(messages(sampleNote({ offerLines: astray.offerLines.slice(0, 3) }), wider)).toEqual([]);
  });

  it('[QL-3] a goal with no index blocks, and an ill-formed artifact is left to the schema validator', () => {
    const bare = sampleIntroductionGoal().split('## Index')[0] ?? '';
    expect(messages(sampleNote(), bare)).toEqual(['the goal carries no introduction index']);
    const broken = { subject: 5 } as unknown as IntroductionNoteOutput;
    expect(messages(broken)).toEqual([]);
  });
});
