import { describe, expect, it } from 'vitest';

import type { TaskContract } from '../../core/contracts';
import { INTERVIEW_TURN } from './definition';
import type { InterviewTurnOutput } from '@sysdesign/contracts';
import { sampleIndex, sampleInterviewGoal, sampleTurn } from './testing';
import { coverageValidator, referencesValidator } from './validators';

const contract = (goal = sampleInterviewGoal()): TaskContract<InterviewTurnOutput> => ({
  ...INTERVIEW_TURN.task,
  goal,
  criteria: [],
});

const messages = (turn: InterviewTurnOutput, goal?: string) => ({
  references: referencesValidator.validate(turn, contract(goal)).problems.map((p) => p.message),
  coverage: coverageValidator.validate(turn, contract(goal)).problems.map((p) => p.message),
});

describe('the interview-turn validators', () => {
  it('[QL-3] the sample passes both; references block and coverage warns', () => {
    expect(messages(sampleTurn())).toEqual({ references: [], coverage: [] });
    expect(referencesValidator.gate).toBe('block');
    expect(coverageValidator.gate).toBe('warn');
  });

  it('[QL-3] [DEL-10] a reply to an item the goal never listed, a second reply to one item, or a disclosure the rubric does not hold blocks, read from the index and never from prose', () => {
    const turn = sampleTurn({
      replies: [
        ...sampleTurn().replies,
        { to: 'question.9', text: 'Nobody asked.', disclosesCriterionIds: ['c9'] },
        { to: 'question.1', text: 'Again.', disclosesCriterionIds: [] },
      ],
    });
    expect(messages(turn).references).toEqual([
      'reply.3 answers question.9, which the goal does not list',
      'reply.4 answers question.1 a second time',
      'reply.3 discloses c9, which the rubric does not hold',
    ]);
    // The same replies under a goal that lists question.9 are fine: the prose never decided.
    const wider = sampleInterviewGoal({
      items: [...sampleIndex().items, { id: 'question.9', kind: 'question' }],
      criterionIds: [...sampleIndex().criterionIds, 'c9'],
    });
    expect(messages(sampleTurn({ replies: turn.replies.slice(0, 3) }), wider).references).toEqual(
      [],
    );
  });

  it('[QL-3] an item left unanswered warns; a goal with no index blocks', () => {
    expect(messages(sampleTurn({ replies: sampleTurn().replies.slice(0, 1) })).coverage).toEqual([
      'question.2 was not addressed',
    ]);
    const bare = sampleInterviewGoal().split('## Index')[0] ?? '';
    expect(messages(sampleTurn(), bare)).toEqual({
      references: ['the goal carries no index of the items to address'],
      coverage: [],
    });
  });

  it('[QL-3] an ill-formed artifact is left to the schema validator', () => {
    const broken = { replies: 'no' } as unknown as InterviewTurnOutput;
    expect(messages(broken)).toEqual({ references: [], coverage: [] });
  });
});
