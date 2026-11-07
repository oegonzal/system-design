/**
 * A page of field answers read back: one route per listed field, by declared
 * order of precedence — the page's own facts, then whether anything was
 * judged, then what the orchestration's report withholds, then the model's
 * decision. A field writes the subject's own words into someone's form, so a
 * field the report withholds is left alone — what withholds it is declared by
 * the pipeline on each finding type and validator, read once by the
 * orchestrator, and consumed here; the session recomputes nothing from the
 * findings or the warnings itself. Measured 2026-10-12: the read-back's own
 * rule, "left alone wherever ANY judge pointed", demoted 36 answered fields to
 * the operator after the controller had accepted 28 of their runs, and 30 of
 * the 34 whose answer is known were right.
 */
import { parseLenient } from '../bounds';
import type { Admission, WithheldRef } from '../quality-loop/admission';
import type { IterationTrace } from '../quality-loop/decision';
import { bestIterationOf } from '../quality-loop/read-back';
import type { QualityRunDto } from '../quality-loop/runs';
import type { AnsweringSettings } from './answering';
import { holdsUnchosenWords } from './element-kind';
import { fieldAnswersSchema, type FieldAnswer } from './field-answers.schema';
import type { FieldSpec } from './field-goal';
import { fieldLocation } from './pipelines';
import type { BrowserDecisionSource, FieldRoute } from './vocab';

export interface FieldReadout {
  position: number;
  field: FieldSpec;
  /**
   * The model's answer for the field as the contract shapes it — the scope
   * it declared the question holds in (`about`) carried through for whoever
   * teaches an operator's answer to it; null when nothing it wrote named the
   * field, or what it wrote was not the contract's shape.
   */
  answer: FieldAnswer | null;
  route: FieldRoute;
  /** What to type or pick when the route is fill; what the field holds when it is keep; the model's suggestion when the operator is asked. */
  value: string | null;
  source: BrowserDecisionSource;
  reason: string;
  /** What the orchestration's report withheld at this field, each with what withheld it and why; empty when nothing did. */
  withheld: readonly WithheldRef[];
}

/** What the session read of the orchestration: the run, its admission, and the locations its report withholds. */
export interface FieldsDecision {
  run: QualityRunDto;
  admission: Admission;
  withheld: readonly WithheldRef[];
}

const readout = (
  position: number,
  field: FieldSpec,
  answer: FieldAnswer | null,
  route: FieldRoute,
  source: BrowserDecisionSource,
  reason: string,
  withheld: readonly WithheldRef[] = [],
): FieldReadout => ({
  position,
  field,
  answer,
  route,
  value: route === 'keep' ? field.value : (answer?.value ?? null),
  source,
  reason,
  withheld,
});

/** What the field holds already, as a value worth a keep: non-empty. */
/** Whether the field holds an answer: words typed into a field chosen from that none of its options has hold none. */
const holds = (field: FieldSpec): boolean =>
  field.value !== null && field.value !== '' && !holdsUnchosenWords(field);

/**
 * Whether the page needs a value in the field: one it marks required, one it
 * marks invalid — it refused what the field holds, or a blank, and will not
 * go on with it — or a choice it asks with nothing chosen. A radio group can
 * say it is required only through attributes its radios may never carry, and
 * leaving a question unanswered is a choice about the subject, so it is the
 * operator's to make — `/blank` included. Measured 2026-10-09: a form that
 * marked every select and text field required marked none of its radio
 * questions, each was left blank as optional, and the page refused to advance
 * past the blank. Measured 2026-11-06: a form marked its phone field required
 * only in the alert it showed on refusing the page, so an answer the operator
 * alone could give was left blank twice as optional, and the form never sent.
 */
export const needsValue = (field: FieldSpec): boolean =>
  field.required || field.invalid || (field.role === 'radiogroup' && !holds(field));

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
  withheld: readonly WithheldRef[] = [],
): FieldReadout =>
  needsValue(field)
    ? readout(position, field, answer, 'ask-operator', source, reason, withheld)
    : readout(
        position,
        field,
        answer,
        'leave-blank',
        source,
        `optional, left blank: ${reason}`,
        withheld,
      );

/**
 * The model's decision, once nothing on the page or in the report has settled
 * the field: a value is typed when the answering settings fill the kind it
 * declares it rests on, and is the operator's otherwise — one table, declared
 * in a file, never a confidence word read here.
 */
function answerRoute(
  fieldCase: FieldCase,
  answer: FieldAnswer,
  fills: AnsweringSettings['fills'],
): FieldReadout {
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
            `${field.required ? 'required field' : field.invalid ? 'refused field' : 'unanswered choice'} left blank: ${answer.reason}`,
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
      if (fills[answer.rests] === 'fill') {
        return readout(position, field, answer, 'fill', source, answer.reason);
      }
      return unsettled(fieldCase, 'loop', `rests ${answer.rests}: ${answer.reason}`);
  }
}

/**
 * One field's route, by declared order of precedence: the page's own facts
 * first (a hidden field stays blank whatever the model said), then an
 * admission that says nothing was judged at all, then what the report
 * withholds at the field, then the model's decision through the answering
 * settings.
 */
function fieldRoute(
  fieldCase: FieldCase,
  admission: Admission,
  withheld: readonly WithheldRef[],
  fills: AnsweringSettings['fills'],
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
  if (withheld.length > 0) return unsettled(fieldCase, 'loop', 'withheld', withheld);
  if (answer === null) return unsettled(fieldCase, 'engine', 'unanswered');
  return answerRoute(fieldCase, answer, fills);
}

/**
 * One route per listed field, by declared order of precedence: the page's
 * own facts first (a hidden field stays blank whatever the model said), then
 * an admission that says nothing was judged at all, then what the
 * orchestration's report withholds at the field — as the pipeline declares
 * each finding type and validator withholds, never "any finding" — then the
 * model's decision, typed when the answering settings fill the kind the value
 * declares it rests on. The operator is asked only for a field the page needs
 * a value in — one it marks required or invalid, or a choice it asks with
 * nothing chosen: any other the answers could not settle is left blank, and
 * the row says why.
 *
 * A run that fell short is recorded on the row and demotes nothing by
 * itself: the judges' objections arrive as what the report withholds at the
 * fields they are about, and the fields they are not about are read on
 * their own merits. Measured 2026-10-07: a page whose run fell short on one
 * unanswerable field sent all three of its fields to the operator — two
 * answered right from memory, all three already filled by the site — and two
 * optional search controls asked as fields cost twelve minutes at the terminal.
 */
export function routeFields(
  decided: FieldsDecision,
  fields: readonly FieldSpec[],
  answering: AnsweringSettings,
): FieldReadout[] {
  const answers = answersOf(bestIterationOf(decided.run));
  const atField = (position: number): WithheldRef[] =>
    decided.withheld.filter((item) => item.ref === fieldLocation(position));
  return fields.map((field, position) =>
    fieldRoute(
      { position, field, answer: answers.get(field.ref) ?? null },
      decided.admission,
      atField(position),
      answering.fills,
    ),
  );
}
