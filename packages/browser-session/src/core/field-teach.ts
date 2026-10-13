import {
  fieldQuestionOf,
  fieldTypeOf,
  GUIDANCE_ANSWER_MAX_LENGTH,
  GUIDANCE_PAGE_MAX_LENGTH,
  GUIDANCE_QUESTION_MAX_LENGTH,
  guidanceDocument,
  operatorGuidanceSchema,
  OPTIONS_SHOWN,
  SUGGESTION_BASES,
  type FieldSpec,
  type OperatorGuidanceDto,
  type PageObservation,
  type SuggestionBasis,
  excerpt,
  quoted,
} from '@sysdesign/contracts';

import type { EngineContext } from './engine-context';
import { settled } from './field-fill';
import type { AnswerSource } from './operator-interaction';
import { BrainFaulted } from './ports';
import { stepJsonFile } from './session-dump';

/**
 * What the operator answered, kept for this session and taught to the memory:
 * `remember` caches an answer for the next form that asks the same and shapes
 * it as the item the guidance document carries, keyed by what the field asks;
 * `teach` hands one item to the memory as its own document the moment it is
 * given.
 */

/** How much of a taught question the log quotes. */
const TAUGHT_QUESTION_QUOTED = 80;

/** The suggestion basis an answer was chosen from, when it was chosen from one; a letter the page's own options lettered is none. */
const suggestionBasisOf = (chosen: AnswerSource | null): SuggestionBasis | null =>
  chosen !== null && (SUGGESTION_BASES as readonly string[]).includes(chosen)
    ? (chosen as SuggestionBasis)
    : null;

/**
 * Keep what the operator said for the next form that asks the same, and shape
 * it as the item taught back at once — or null for a field that asks nothing
 * it can be told by, which no probe could ever find again: kept for the
 * session, taught to nobody, and said so.
 */
export function remember(
  ctx: EngineContext,
  field: FieldSpec,
  answer: string,
  observation: PageObservation,
  chosen: AnswerSource | null,
): OperatorGuidanceDto | null {
  const { state, deps } = ctx;
  settled(state.operatorAnswers, field, answer);
  settled(state.filled, field, answer);
  const question = fieldQuestionOf(field);
  if (question === null) {
    deps.warn(
      `step ${state.step}: ${field.ref} asks nothing it can be taught by; the answer is kept for this session only`,
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
    context: { taskLabel: state.tasks.open?.label ?? null, page: page === '' ? null : page },
    answer: excerpt(answer, GUIDANCE_ANSWER_MAX_LENGTH),
    chosen: suggestionBasisOf(chosen),
  }) as OperatorGuidanceDto;
}

const day = (at: Date): string => at.toISOString().slice(0, 10);

/**
 * One operator answer handed to the memory as soon as it is given, as its
 * own guidance document, the orchestration id written onto the decision row
 * it came from. At once rather than when the unit of work closes: measured
 * 2026-10-07, a unit that never closed taught nothing, and the one answer
 * the memory lacked would have been asked again the next session.
 */
export async function teach(
  ctx: EngineContext,
  decisionId: string,
  item: OperatorGuidanceDto,
): Promise<void> {
  const { state, deps, queue } = ctx;
  const document = guidanceDocument(
    state.sessionId,
    ctx.options.subject,
    [item],
    day(deps.clock.now()),
  );
  const question = quoted(excerpt(item.field.question, TAUGHT_QUESTION_QUOTED));
  try {
    const { orchestrationRunId } = await deps.brain.teach(document, {
      sessionId: state.sessionId,
      step: state.step,
    });
    queue.write(`decision ${decisionId} teaching`, () =>
      deps.ledger.recordTeaching([decisionId], orchestrationRunId),
    );
    state.teachings.push({ decisionId, document, orchestrationRunId, fault: null });
    deps.log(`step ${state.step}: ${question} taught through ${orchestrationRunId}`);
  } catch (error) {
    if (!(error instanceof BrainFaulted)) throw error;
    state.teachings.push({ decisionId, document, orchestrationRunId: null, fault: error.message });
    deps.warn(`step ${state.step}: ${question} not taught — ${error.message}`);
  }
  ctx.dumpFiles('teach', [stepJsonFile(state.step, 'teach', state.teachings)]);
}
