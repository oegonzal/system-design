/**
 * A page of field answers read back: one route per listed field, by declared
 * order of precedence — the page's own facts, then whether anything was
 * judged, then what a judge or a validator pointed at, then the model's
 * decision. A field writes the subject's own words into someone's form, so it
 * is left alone wherever any judge pointed.
 */
import { parseLenient } from '../bounds';
import type { Admission } from '../quality-loop/admission';
import type { IterationTrace } from '../quality-loop/decision';
import type { ConfirmedFinding } from '../quality-loop/evidence';
import type { QualityRunDto } from '../quality-loop/runs';
import { fieldAnswersSchema, type FieldAnswer } from './field-answers.schema';
import type { FieldSpec } from './field-goal';
import { FIELD_LOCATION, positionOf } from './pipelines';
import { bestIterationOf } from './read-back';
import type { BrowserDecisionSource, FieldRoute } from './vocab';

/**
 * The positions of a positional artifact that something pointed at, for a
 * caller that must leave every one of them alone — every validator's problem
 * and, when asked, every confirmed finding, blocking or not. A field writes
 * the subject's own words into someone's form, so it is left alone wherever
 * ANY judge pointed; the costs are not symmetric with a plan's, and neither
 * is the rule.
 */
function faultedPositions(
  iteration: IterationTrace,
  grammar: RegExp,
  findings: readonly ConfirmedFinding[],
): Map<number, string[]> {
  const faults = new Map<number, string[]>();
  const add = (refs: readonly string[], what: string): void => {
    for (const ref of refs) {
      const position = positionOf(ref, grammar);
      if (position === null) continue;
      faults.set(position, [...(faults.get(position) ?? []), what]);
    }
  };
  for (const finding of findings) {
    add(
      finding.locationRefs,
      `${finding.type}${finding.rationale ? `: ${finding.rationale}` : ''}`,
    );
  }
  for (const report of iteration.validation) {
    for (const problem of report.problems)
      add(problem.locationRefs, `${report.validatorId}: ${problem.message}`);
  }
  return faults;
}

export interface FieldReadout {
  position: number;
  field: FieldSpec;
  answer: FieldAnswer | null;
  route: FieldRoute;
  /** What to type or pick when the route is fill; what the field holds when it is keep; the model's suggestion when the operator is asked. */
  value: string | null;
  source: BrowserDecisionSource;
  reason: string;
  faults: string[];
}

const readout = (
  position: number,
  field: FieldSpec,
  answer: FieldAnswer | null,
  route: FieldRoute,
  source: BrowserDecisionSource,
  reason: string,
  faults: string[] = [],
): FieldReadout => ({
  position,
  field,
  answer,
  route,
  value: route === 'keep' ? field.value : (answer?.value ?? null),
  source,
  reason,
  faults,
});

/** What the field holds already, as a value worth a keep: non-empty. */
const holds = (field: FieldSpec): boolean => field.value !== null && field.value !== '';

/**
 * Whether the page needs a value in the field: one it marks required, or a
 * choice it asks with nothing chosen. A radio group can say it is required
 * only through attributes its radios may never carry, and leaving a question
 * unanswered is a choice about the subject, so it is the operator's to make
 * — `/blank` included. Measured 2026-10-09: a form that marked every select
 * and text field required marked none of its radio questions, each was left
 * blank as optional, and the page refused to advance past the blank.
 */
const needsValue = (field: FieldSpec): boolean =>
  field.required || (field.role === 'radiogroup' && !holds(field));

/** The answers of the best iteration by ref, when its artifact read as answers. */
const answersOf = (best: IterationTrace | null): Map<string, FieldAnswer> => {
  const parsed =
    best === null || best.artifact === null
      ? null
      : parseLenient(fieldAnswersSchema, best.artifact);
  return new Map(parsed?.ok ? parsed.value.fields.map((answer) => [answer.ref, answer]) : []);
};

/** One field as it is being routed: where it sits, what the page says of it, and what the model said. */
interface FieldCase {
  position: number;
  field: FieldSpec;
  answer: FieldAnswer | null;
}

/** A field the answers could not settle: the operator's when the page needs a value in it, else left blank and said so. */
const unsettled = (
  { position, field, answer }: FieldCase,
  source: BrowserDecisionSource,
  reason: string,
  faults: string[] = [],
): FieldReadout =>
  needsValue(field)
    ? readout(position, field, answer, 'ask-operator', source, reason, faults)
    : readout(
        position,
        field,
        answer,
        'leave-blank',
        source,
        `optional, left blank: ${reason}`,
        faults,
      );

/** The model's decision, read with its confidence and basis once nothing on the page or in the run has settled the field. */
function answerRoute(fieldCase: FieldCase, answer: FieldAnswer): FieldReadout {
  const { position, field } = fieldCase;
  const grounded = answer.basis.length > 0;
  const source = grounded ? 'memory' : 'loop';
  switch (answer.decision) {
    case 'keep':
      return holds(field)
        ? readout(position, field, answer, 'keep', source, answer.reason)
        : unsettled(fieldCase, 'loop', `nothing to keep: ${answer.reason}`);
    case 'ask-operator':
      return unsettled(fieldCase, 'loop', answer.reason);
    case 'leave-blank':
      return needsValue(field)
        ? readout(
            position,
            field,
            answer,
            'ask-operator',
            'loop',
            `${field.required ? 'required field' : 'unanswered choice'} left blank: ${answer.reason}`,
          )
        : readout(position, field, answer, 'leave-blank', 'blank', answer.reason);
    case 'answer':
      // An answer that says what the field holds is a keep: nothing is typed over itself.
      if (holds(field) && answer.value === field.value) {
        return readout(
          position,
          field,
          answer,
          'keep',
          source,
          `holds it already: ${answer.reason}`,
        );
      }
      if (answer.confidence === 'high' || (answer.confidence === 'medium' && grounded)) {
        return readout(position, field, answer, 'fill', source, answer.reason);
      }
      return unsettled(fieldCase, 'loop', `${answer.confidence} confidence: ${answer.reason}`);
  }
}

/**
 * One field's route, by declared order of precedence: the page's own facts
 * first (a hidden field stays blank whatever the model said), then an
 * admission that says nothing was judged at all, then what a judge or a
 * validator pointed at, then the model's decision.
 */
function fieldRoute(
  fieldCase: FieldCase,
  admission: Admission,
  faults: readonly string[],
): FieldReadout {
  const { position, field, answer } = fieldCase;
  if (field.hiddenTraits.length > 0) {
    return readout(
      position,
      field,
      answer,
      'leave-blank',
      'blank',
      'trap-skipped: the page hides this field',
    );
  }
  if (admission === 'no-rubric' || admission === 'no-artifact') {
    return unsettled(fieldCase, 'engine', `page-escalated: ${admission}`);
  }
  if (faults.length > 0) return unsettled(fieldCase, 'loop', 'faulted', [...faults]);
  if (answer === null) return unsettled(fieldCase, 'engine', 'unanswered');
  return answerRoute(fieldCase, answer);
}

/**
 * One route per listed field, by declared order of precedence: the page's
 * own facts first (a hidden field stays blank whatever the model said), then
 * an admission that says nothing was judged at all, then what a judge or a
 * validator pointed at, then the model's decision read with its confidence
 * and basis. The operator is asked only for a field the page needs a value
 * in — one it marks required, or a choice it asks with nothing chosen: any
 * other the answers could not settle is left blank, and the row says why.
 *
 * A run that fell short is recorded on the row and demotes nothing by
 * itself: the judges' objections arrive as faults at the fields they are
 * about, and the fields they are not about are read on their own merits.
 * Measured 2026-10-07: a page whose run fell short on one unanswerable
 * field sent all three of its fields to the operator — two answered right
 * from memory, all three already filled by the site — and two optional
 * search controls asked as fields cost twelve minutes at the terminal.
 */
export function routeFields(
  run: QualityRunDto,
  admission: Admission,
  fields: readonly FieldSpec[],
): FieldReadout[] {
  const best = bestIterationOf(run);
  const answers = answersOf(best);
  const faulted =
    best === null
      ? new Map<number, string[]>()
      : faultedPositions(best, FIELD_LOCATION, best.ledger.findings);
  return fields.map((field, position) =>
    fieldRoute(
      { position, field, answer: answers.get(field.ref) ?? null },
      admission,
      faulted.get(position) ?? [],
    ),
  );
}
