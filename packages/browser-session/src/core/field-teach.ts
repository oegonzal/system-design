import {
  GUIDANCE_ANSWER_MAX_LENGTH,
  GUIDANCE_PAGE_MAX_LENGTH,
  guidanceDocument,
  OPTIONS_SHOWN,
  type FieldSpec,
  type OperatorGuidanceDto,
  type PageObservation,
  excerpt,
} from '@sysdesign/contracts';

import type { EngineContext } from './engine-context';
import { settled } from './field-fill';
import { fieldTypeOf } from './field-routing';
import { BrainFaulted } from './ports';
import { stepJsonFile } from './session-dump';

/**
 * What the operator answered, kept for this session and taught to the memory:
 * `remember` shapes an answer as the item the guidance document carries and
 * caches it for the next form that asks the same; `teach` hands one item to
 * the memory as its own document the moment it is given.
 */

/** Keep what the operator said for the next form that asks the same, and shape it as the item taught back at once. */
export function remember(
  ctx: EngineContext,
  field: FieldSpec,
  answer: string,
  observation: PageObservation,
): OperatorGuidanceDto {
  const { state } = ctx;
  settled(state.operatorAnswers, field, answer);
  settled(state.filled, field, answer);
  const page = excerpt(observation.title, GUIDANCE_PAGE_MAX_LENGTH);
  return {
    sessionId: state.sessionId,
    capturedAt: ctx.deps.clock.now().toISOString(),
    field: {
      label: field.name,
      question: field.context,
      type: fieldTypeOf(field),
      // What the step goal would show of them: a list of hundreds is no fact worth storing.
      options: field.options === null ? null : field.options.slice(0, OPTIONS_SHOWN),
    },
    context: { taskLabel: state.tasks.open?.label ?? null, page: page === '' ? null : page },
    answer: excerpt(answer, GUIDANCE_ANSWER_MAX_LENGTH),
  };
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
  try {
    const { orchestrationRunId } = await deps.brain.teach(document, {
      sessionId: state.sessionId,
      step: state.step,
    });
    queue.write(`decision ${decisionId} teaching`, () =>
      deps.ledger.recordTeaching([decisionId], orchestrationRunId),
    );
    state.teachings.push({ decisionId, document, orchestrationRunId, fault: null });
    deps.log(`step ${state.step}: "${item.field.label}" taught through ${orchestrationRunId}`);
  } catch (error) {
    if (!(error instanceof BrainFaulted)) throw error;
    state.teachings.push({ decisionId, document, orchestrationRunId: null, fault: error.message });
    deps.warn(`step ${state.step}: "${item.field.label}" not taught — ${error.message}`);
  }
  ctx.dumpFiles('teach', [stepJsonFile(state.step, 'teach', state.teachings)]);
}
