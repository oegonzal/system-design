/**
 * The exact checks on field answers: what the form's index says against what
 * the answers do. `references` blocks — an answer for a field the form never
 * listed, or resting on evidence the goal never listed, cannot be trusted by
 * any lens. `limits` only WARNS, on purpose: a value the field cannot take is
 * located at its field, the lenses read it, and the session routes that one
 * field to the operator instead of the whole judged page being voided.
 * Nothing here reads prose: every fact is in the index the composer wrote.
 */
import {
  fieldLocation,
  type FieldAnswer,
  type FieldAnswers,
  type FieldIndex,
  type FieldSpec,
  type Severity,
  type ValidationProblem,
} from '@sysdesign/contracts';

import {
  asWarning,
  indexedValidator,
  LIMITS_VALIDATOR_ID,
  problem,
  REFERENCES_VALIDATOR_ID,
  type IndexedRule,
} from '../../core/contracts';
import type { Validator } from '../../core/ports';
import { FIELD_ANSWER_PIPELINE_ID, readIndex } from './input';

export { LIMITS_VALIDATOR_ID, REFERENCES_VALIDATOR_ID };

type Rule = IndexedRule<FieldAnswers, FieldIndex>;
type Fault = { severity: Severity; message: string };

const quote = (text: string): string => JSON.stringify(text);

/** Every listed field answered exactly once, every basis alias listed. */
const references: Rule = (answers, index) => {
  const fields = new Set(index.fields.map((field) => field.ref));
  const aliases = new Set(index.evidence.map((item) => item.alias));
  const seen = new Set<string>();
  const problems: ValidationProblem[] = [];
  answers.fields.forEach((answer, position) => {
    const at = [fieldLocation(position)];
    if (!fields.has(answer.ref)) {
      problems.push(problem('critical', `${answer.ref} is not a listed field`, at));
    } else if (seen.has(answer.ref)) {
      problems.push(problem('critical', `${answer.ref} is answered more than once`, at));
    }
    seen.add(answer.ref);
    for (const alias of answer.basis) {
      if (!aliases.has(alias))
        problems.push(problem('critical', `${alias} is not listed evidence`, at));
    }
  });
  for (const field of index.fields) {
    if (!seen.has(field.ref)) problems.push(problem('critical', `${field.ref} is not answered`));
  }
  return problems;
};

/** A number input takes a number: not blank, and one `Number` reads whole. */
const isNumeric = (value: string): boolean =>
  value.trim().length > 0 && Number.isFinite(Number(value));

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
  if (value !== null && field.hiddenTraits.length > 0) {
    fault(
      'high',
      `${ref} is hidden (${field.hiddenTraits.join(', ')}); a field the page hides is given no value`,
    );
  }
  if (value !== null && field.maxLength !== null && value.length > field.maxLength) {
    fault(
      'medium',
      `${ref} takes at most ${field.maxLength} characters; the value runs to ${value.length}`,
    );
  }
  if (value !== null && field.options !== null && !field.options.includes(value)) {
    fault('medium', `${quote(value)} is not an option of ${ref}`);
  }
  if (value !== null && field.inputType === 'number' && !isNumeric(value)) {
    fault('medium', `${ref} takes a number; ${quote(value)} is not one`);
  }
  if (answer.decision === 'leave-blank' && field.required && field.hiddenTraits.length === 0) {
    fault('medium', `${ref} is required and visible, yet left blank`);
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
 * Warn rather than block, and withhold nothing: a value past a field's own
 * maxLength, or a numeric field answered with prose, is one field's problem.
 * Blocking would close admission on the whole page and the operator would be
 * asked to fill every field of it; withholding would drop the answers this
 * validator located, which is the same page lost by a quieter route. Located
 * warnings route exactly the faulted fields to the operator and leave the rest
 * to be filled.
 */
export const limitsValidator: Validator<FieldAnswers> = asWarning(
  indexedValidator(LIMITS_VALIDATOR_ID, readIndex, limits, []),
  'none',
);
