/**
 * The exact checks on an interviewer's turn, read against the index the
 * studio wrote under the goal. References block: a reply to an item the goal
 * never listed, two replies to one item, or a disclosure of a criterion the
 * rubric does not hold would be stored as the interviewer's word on
 * something nobody asked. Coverage warns: an item left unanswered is a
 * defect the lenses are told about, not a refusal — the candidate still
 * gets what was answered.
 */
import type { InterviewIndex, InterviewTurnOutput } from '@sysdesign/contracts';

import {
  asWarning,
  indexedValidator,
  misplaced,
  problem,
  REFERENCES_VALIDATOR_ID,
  unplaced,
  type IndexedRule,
} from '../../core/contracts';
import { readInterviewIndex } from './input';

const COVERAGE_VALIDATOR_ID = 'coverage';

type Rule = IndexedRule<InterviewTurnOutput, InterviewIndex>;

const replyRef = (position: number): string => `reply.${position + 1}`;

const references: Rule = (output, index) => {
  const criteria = new Set(index.criterionIds);
  const undisclosable = output.replies.flatMap((reply, position) =>
    reply.disclosesCriterionIds
      .filter((id) => !criteria.has(id))
      .map((id) =>
        problem(
          'critical',
          `${replyRef(position)} discloses ${id}, which the rubric does not hold`,
          [replyRef(position)],
        ),
      ),
  );
  return [
    ...misplaced(
      index.items.map((item) => item.id),
      output.replies.map((reply, position) => ({ ref: reply.to, at: [replyRef(position)] })),
      {
        unlisted: (id, at) => `${at.join(', ')} answers ${id}, which the goal does not list`,
        repeated: (id, at) => `${at.join(', ')} answers ${id} a second time`,
      },
    ),
    ...undisclosable,
  ];
};

const coverage: Rule = (output, index) =>
  unplaced(
    index.items.map((item) => item.id),
    output.replies.map((reply) => reply.to),
    'medium',
    (id) => `${id} was not addressed`,
  );

export const referencesValidator = indexedValidator(
  REFERENCES_VALIDATOR_ID,
  readInterviewIndex,
  references,
  [problem('critical', 'the goal carries no index of the items to address')],
);
export const coverageValidator = asWarning(
  indexedValidator(COVERAGE_VALIDATOR_ID, readInterviewIndex, coverage, []),
);
