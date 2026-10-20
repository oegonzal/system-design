/**
 * The exact checks on an interviewer's turn, read against the index the
 * studio wrote under the goal. References block: a reply to an item the goal
 * never listed, two replies to one item, or a disclosure of a criterion the
 * rubric does not hold would be stored as the interviewer's word on
 * something nobody asked. Coverage warns: an item left unanswered is a
 * defect the lenses are told about, not a refusal — the candidate still
 * gets what was answered.
 */
import type { InterviewTurnOutput, ValidationProblem } from '@sysdesign/contracts';

import { problem, readArtifact, type TaskContract } from '../../core/contracts';
import type { Validator } from '../../core/ports';
import { readInterviewIndex } from './input';

export const REFERENCES_VALIDATOR_ID = 'references';
export const COVERAGE_VALIDATOR_ID = 'coverage';

function references(output: InterviewTurnOutput, goal: string): ValidationProblem[] {
  const index = readInterviewIndex(goal);
  if (index === null) {
    return [problem('critical', 'the goal carries no index of the items to address')];
  }
  const items = new Set(index.items.map((item) => item.id));
  const criteria = new Set(index.criterionIds);
  const seen = new Set<string>();
  return output.replies.flatMap((reply, position) => {
    const ref = `reply.${position + 1}`;
    const problems: ValidationProblem[] = [];
    if (!items.has(reply.to)) {
      problems.push(
        problem('critical', `${ref} answers ${reply.to}, which the goal does not list`, [ref]),
      );
    } else if (seen.has(reply.to)) {
      problems.push(problem('critical', `${ref} answers ${reply.to} a second time`, [ref]));
    }
    seen.add(reply.to);
    for (const id of reply.disclosesCriterionIds) {
      if (!criteria.has(id)) {
        problems.push(
          problem('critical', `${ref} discloses ${id}, which the rubric does not hold`, [ref]),
        );
      }
    }
    return problems;
  });
}

function coverage(output: InterviewTurnOutput, goal: string): ValidationProblem[] {
  const index = readInterviewIndex(goal);
  if (index === null) return [];
  const answered = new Set(output.replies.map((reply) => reply.to));
  return index.items
    .filter((item) => !answered.has(item.id))
    .map((item) => problem('medium', `${item.id} was not addressed`));
}

const validator = (
  id: string,
  gate: 'block' | 'warn',
  rule: (output: InterviewTurnOutput, goal: string) => ValidationProblem[],
): Validator<InterviewTurnOutput> => ({
  id,
  gate,
  validate: (artifact, contract: TaskContract<InterviewTurnOutput>) => {
    // An ill-formed artifact is the schema validator's to report, once.
    const parsed = readArtifact(contract.output.schema, artifact);
    return { validatorId: id, gate, problems: parsed.ok ? rule(parsed.value, contract.goal) : [] };
  },
});

export const referencesValidator = validator(REFERENCES_VALIDATOR_ID, 'block', references);
export const coverageValidator = validator(COVERAGE_VALIDATOR_ID, 'warn', coverage);
