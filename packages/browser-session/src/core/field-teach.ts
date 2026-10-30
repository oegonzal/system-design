import {
  fieldQuestionOf,
  fieldTypeOf,
  GUIDANCE_ANSWER_MAX_LENGTH,
  GUIDANCE_PAGE_MAX_LENGTH,
  GUIDANCE_QUESTION_MAX_LENGTH,
  operatorGuidanceSchema,
  OPTIONS_SHOWN,
  SUGGESTION_BASES,
  type FieldSpec,
  type MemoryScope,
  type OperatorGuidanceDto,
  type PageObservation,
  type SuggestionBasis,
  excerpt,
  quoted,
} from '@sysdesign/contracts';

import type { EngineContext } from './engine-context';
import { settled } from './field-fill';
import type { AnswerSource } from './operator-interaction';
import { BrainFaulted, type TeachReceipt } from './ports';
import { stepJsonFile } from './session-dump';
import { openUnitAnswers, openUnitFilled, openUnitKeyOf, type Teaching } from './session-state';

/**
 * What the operator answered, kept for this session and taught to the memory:
 * `remember` caches an answer for the next form of the same unit of work that
 * asks the same and — unless the channel it came on is one the operator
 * settings keep untaught — shapes it as the item the brain is handed, keyed
 * by what the field asks, recorded for the unit it was given in, under the
 * scope the answerer declared, and naming its channel; `teach` hands one item
 * to the brain the moment it is given and answers what the memory did with
 * it; `recordTeaching` writes that onto the row the answer made and into the
 * step's dump.
 */

/** How much of a taught question the log quotes. */
const TAUGHT_QUESTION_QUOTED = 80;

/** The suggestion basis an answer was chosen from, when it was chosen from one; a letter the page's own options lettered is none. */
const suggestionBasisOf = (chosen: AnswerSource | null): SuggestionBasis | null =>
  chosen !== null && (SUGGESTION_BASES as readonly string[]).includes(chosen)
    ? (chosen as SuggestionBasis)
    : null;

/**
 * Keep what the operator said for the next form of the same unit of work
 * that asks the same, and shape it as the item taught back at once — under
 * the scope the answerer declared the question holds in (`about`, null when
 * no artifact answered the field) — or null, kept for the session, taught to
 * nobody, and said so: for a field that asks nothing it can be told by, which
 * no probe could ever find again, and for an answer given on a channel the
 * operator settings keep untaught, which is nobody's fact to store as the
 * subject's.
 */
export function remember(
  ctx: EngineContext,
  field: FieldSpec,
  answer: string,
  observation: PageObservation,
  chosen: AnswerSource | null,
  via: string,
  about: MemoryScope | null,
): OperatorGuidanceDto | null {
  const { state, deps } = ctx;
  settled(openUnitAnswers(state), field, answer);
  settled(openUnitFilled(state), field, answer);
  const question = fieldQuestionOf(field);
  if (question === null) {
    deps.warn(
      `step ${state.step}: ${field.ref} asks nothing it can be taught by; the answer is kept for this session only`,
    );
    return null;
  }
  if (ctx.options.untaught.includes(via)) {
    deps.log(
      `step ${state.step}: ${field.ref} answered via ${via}, which the operator settings do not teach; kept for this session only`,
    );
    return null;
  }
  const page = excerpt(observation.title, GUIDANCE_PAGE_MAX_LENGTH);
  return operatorGuidanceSchema.parse({
    sessionId: state.sessionId,
    capturedAt: deps.clock.now().toISOString(),
    field: {
      question: excerpt(question, GUIDANCE_QUESTION_MAX_LENGTH),
      type: fieldTypeOf(field),
      // What the step goal would show of them: a list of hundreds is no fact worth storing.
      options: field.options === null ? null : field.options.slice(0, OPTIONS_SHOWN),
    },
    context: {
      taskLabel: state.tasks.open?.label ?? null,
      unitKey: openUnitKeyOf(state),
      page: page === '' ? null : page,
    },
    answer: excerpt(answer, GUIDANCE_ANSWER_MAX_LENGTH),
    about,
    chosen: suggestionBasisOf(chosen),
    via,
  }) as OperatorGuidanceDto;
}

/** What one teach left before its row is known: the answer, whom it was taught as, and what the memory did with it. */
export type Taught = Omit<Teaching, 'decisionId'>;

/** A receipt in the log's words: what the memory did and where the teaching can be found, or why it was refused. */
const describeReceipt = ({ ref, outcome, fault }: TeachReceipt): string =>
  outcome === 'refused'
    ? `refused by the memory — ${fault ?? 'no reason given'}`
    : `taught — ${outcome}${ref === null ? '' : ` ${ref}`}${fault === null ? '' : ` (${fault})`}`;

/**
 * One operator answer handed to the brain as soon as it is given, as the
 * subject's own, and what came of it: the reference the memory left and the
 * outcome in its own words, or — when the brain answered nothing — the fault
 * as the one record of the attempt, with no outcome. At once rather than
 * when the unit of work closes: measured 2026-10-07, a unit that never closed
 * taught nothing, and the one answer the memory lacked would have been asked
 * again the next session.
 */
export async function teach(ctx: EngineContext, item: OperatorGuidanceDto): Promise<Taught> {
  const { state, deps } = ctx;
  const { subject } = ctx.options;
  const question = quoted(excerpt(item.field.question, TAUGHT_QUESTION_QUOTED));
  try {
    const [receipt] = await deps.brain.teach(
      [item],
      { sessionId: state.sessionId, step: state.step },
      subject,
    );
    if (receipt === undefined) throw new Error('the brain answered no receipt for the one answer');
    const said = `step ${state.step}: ${question} ${describeReceipt(receipt)}`;
    if (receipt.outcome === 'refused') deps.warn(said);
    else deps.log(said);
    return { answer: item, subject, ...receipt };
  } catch (error) {
    if (!(error instanceof BrainFaulted)) throw error;
    deps.warn(`step ${state.step}: ${question} not taught — ${error.message}`);
    return { answer: item, subject, ref: null, outcome: null, fault: error.message };
  }
}

/**
 * What came of a teaching, recorded against the row its answer made: the
 * reference onto the row when the memory left one, the teaching into the
 * step's list, and the list into the step's dump.
 */
export function recordTeaching(ctx: EngineContext, decisionId: string, taught: Taught): void {
  const { state, deps, queue } = ctx;
  const { ref } = taught;
  if (ref !== null) {
    queue.write(`decision ${decisionId} teaching`, () =>
      deps.ledger.recordTeaching([decisionId], ref),
    );
  }
  state.teachings.push({ decisionId, ...taught });
  ctx.dumpFiles('teach', [stepJsonFile(state.step, 'teach', state.teachings)]);
}
