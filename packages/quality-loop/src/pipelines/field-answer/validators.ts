/**
 * The exact checks on field answers: what the form's index says against what
 * the answers do. `references` blocks — an answer for a field the form never
 * listed, or resting on evidence the goal never listed, cannot be trusted by
 * any lens. `limits` only WARNS, on purpose: a value the field cannot take is
 * located at its field, the lenses read it, and the orchestration's report
 * withholds that one field — the session asks the operator for it — instead
 * of the whole judged page being voided. Nothing here reads prose: every fact
 * is in the index the composer wrote.
 */
import {
  ANSWER_BASIS_CITES,
  fieldLocation,
  valueFaults,
  type FieldAnswer,
  type FieldAnswers,
  type FieldIndex,
  type FieldSpec,
  type Severity,
} from '@sysdesign/contracts';

import {
  asWarning,
  indexedValidator,
  LIMITS_VALIDATOR_ID,
  misplaced,
  problem,
  REFERENCES_VALIDATOR_ID,
  unlisted,
  unplaced,
  type IndexedRule,
} from '../../core/contracts';
import type { Validator } from '../../core/ports';
import { FIELD_ANSWER_PIPELINE_ID, readIndex } from './input';

export { LIMITS_VALIDATOR_ID, REFERENCES_VALIDATOR_ID };

type Rule = IndexedRule<FieldAnswers, FieldIndex>;
type Fault = { severity: Severity; message: string };

/** Every listed field answered exactly once, every basis alias listed. */
const references: Rule = (answers, index) => {
  const listed = index.fields.map((field) => field.ref);
  return [
    ...misplaced(
      listed,
      answers.fields.map((answer, position) => ({
        ref: answer.ref,
        at: [fieldLocation(position)],
      })),
      {
        unlisted: (ref) => `${ref} is not a listed field`,
        repeated: (ref) => `${ref} is answered more than once`,
      },
    ),
    ...unlisted(
      index.evidence.map((item) => item.alias),
      answers.fields.flatMap((answer, position) =>
        answer.basis.map((alias) => ({ ref: alias, at: [fieldLocation(position)] })),
      ),
      (alias) => `${alias} is not listed evidence`,
    ),
    ...unplaced(
      listed,
      answers.fields.map((answer) => answer.ref),
      'critical',
      (ref) => `${ref} is not answered`,
    ),
  ];
};

/** What one answer does that its field cannot take, in the order the page would refuse it. */
function answerFaults(answer: FieldAnswer, field: FieldSpec): Fault[] {
  const faults: Fault[] = [];
  const fault = (severity: Severity, message: string): void => {
    faults.push({ severity, message });
  };
  const { ref } = field;
  const value = answer.value;
  if (answer.decision === 'answer' && value === null)
    fault('medium', `${ref} is answered with no value`);
  if (answer.decision !== 'answer' && value !== null) {
    fault('medium', `${ref} carries a value although the decision is ${answer.decision}`);
  }
  if (value !== null) faults.push(...valueFaults(field, value));
  if (answer.decision === 'leave-blank' && field.required && field.hiddenTraits.length === 0) {
    fault('medium', `${ref} is required and visible, yet left blank`);
  }
  // How a value rests is declared data the read-back routes by: a declaration
  // the answer itself contradicts is withheld, never filled on its word. Which
  // kinds owe a citation is the vocabulary's own table: a kind resting on
  // another section of the goal — the policy, the unit's statement — owes none.
  if (answer.decision === 'answer' && answer.rests === 'none') {
    fault('medium', `${ref} is answered with a value resting on nothing`);
  }
  if (
    answer.decision === 'answer' &&
    ANSWER_BASIS_CITES[answer.rests] &&
    answer.basis.length === 0
  ) {
    fault('medium', `${ref} rests ${answer.rests} on the evidence yet cites none`);
  }
  if (answer.rests === 'mapped' && field.options === null) {
    fault('medium', `${ref} is mapped yet offers no options`);
  }
  if (answer.decision !== 'answer' && answer.rests !== 'none') {
    fault(
      'medium',
      `${ref} declares how a value rests although the decision is ${answer.decision}`,
    );
  }
  return faults;
}

const limits: Rule = (answers, index) => {
  const fields = new Map(index.fields.map((field) => [field.ref, field]));
  return answers.fields.flatMap((answer, position) => {
    const field = fields.get(answer.ref);
    // An unlisted ref has no field to check against; the references rule owns it.
    if (field === undefined) return [];
    return answerFaults(answer, field).map((fault) =>
      problem(fault.severity, fault.message, [fieldLocation(position)]),
    );
  });
};

export const referencesValidator: Validator<FieldAnswers> = indexedValidator(
  REFERENCES_VALIDATOR_ID,
  readIndex,
  references,
  [problem('critical', `the goal carries no ${FIELD_ANSWER_PIPELINE_ID} index`)],
);

/**
 * Warn rather than block: a value past a field's own maxLength, or a numeric
 * field answered with prose, is one field's problem. Blocking would close
 * admission on the whole page and the operator would be asked to fill every
 * field of it. A located warning withholds exactly the field it names — the
 * declaration the report is read by — so the session asks the operator for
 * that one and fills the rest.
 */
export const limitsValidator: Validator<FieldAnswers> = asWarning(
  indexedValidator(LIMITS_VALIDATOR_ID, readIndex, limits, []),
  'every-ref',
);
