import {
  elementKind,
  fieldSpecOf,
  GUIDANCE_ANSWER_MAX_LENGTH,
  GUIDANCE_PAGE_MAX_LENGTH,
  guidanceDocument,
  OPTIONS_SHOWN,
  type Admission,
  type BrowserDecisionSource,
  type FieldAnswers,
  type FieldRoute,
  type FieldSpec,
  type OperatorGuidanceDto,
  type PageObservation,
  excerpt,
} from '@sysdesign/contracts';

import type { DecisionInput, EngineContext } from './engine-context';
import { fieldTypeOf, routeFieldsInSession, type RoutedField } from './field-routing';
import {
  ActionFailed,
  BrainFaulted,
  type BrowserAction,
  type Decided,
  type OperatorReply,
} from './ports';
import { stepJsonFile } from './session-dump';

/**
 * A plan's `askFields`: the fields go to the form-memory orchestration as
 * one goal — except those that still hold what this session settled for
 * them, which are kept without a run — the answers come back as one run, and
 * each field is routed by the declared table: filled, kept, left blank, or
 * put to the operator with the model's value as a suggestion and the reason
 * it was not trusted. The operator's answers are cached for the session and
 * taught back the moment they are given. One decision row per field settled.
 * A fill the page refuses stops the flow where it is — the page may have
 * moved on — so the fields after it are not attempted, and the plan stops
 * with it; the failure is counted once, by the step.
 */
export interface FieldResult {
  ref: string;
  label: string;
  /** What was done, after the operator's say. */
  route: FieldRoute;
  source: BrowserDecisionSource;
  value: string | null;
  outcome: 'ok' | 'failed';
  reply: OperatorReply['kind'] | null;
  cached: boolean;
  detail: string | null;
  /** The answer the operator gave here, taught back as soon as it was given. */
  guidance: OperatorGuidanceDto | null;
}

export interface FieldsOutcome {
  stopped: boolean;
  failed: boolean;
  note: string;
}

type FieldsDecided = Decided<FieldAnswers> & { admission: Admission };

/** The browser action that puts a value into a field: an option for a selectable one, text otherwise. */
export const fillActionOf = (field: FieldSpec, value: string): BrowserAction =>
  elementKind(field.role, field) === 'selectable'
    ? {
        kind: 'select',
        ref: field.ref,
        option: value,
        reason: 'field answer',
        expect: null,
        serves: [],
      }
    : { kind: 'fill', ref: field.ref, value, reason: 'field answer', expect: null, serves: [] };

const result = (
  field: RoutedField,
  route: FieldRoute,
  source: BrowserDecisionSource,
  value: string | null,
  reply: OperatorReply['kind'] | null,
  outcome: 'ok' | 'failed' = 'ok',
  detail: string | null = null,
): FieldResult => ({
  ref: field.field.ref,
  label: field.field.name,
  route,
  source,
  value,
  outcome,
  reply,
  cached: field.cached,
  detail,
  guidance: null,
});

/** The page refused the fill: the result says so, and the caller stops. */
async function fill(
  ctx: EngineContext,
  field: RoutedField,
  value: string,
  source: BrowserDecisionSource,
  reply: OperatorReply['kind'] | null,
): Promise<FieldResult> {
  try {
    await ctx.deps.browser.act(fillActionOf(field.field, value));
    ctx.state.filled.set(field.field.name, value);
    return result(field, 'fill', source, value, reply);
  } catch (error) {
    if (!(error instanceof ActionFailed)) throw error;
    return result(field, 'fill', source, value, reply, 'failed', error.message);
  }
}

/** Keep what the operator said for the next form that asks the same, and shape it as the item taught back at once. */
function remember(
  ctx: EngineContext,
  field: FieldSpec,
  answer: string,
  observation: PageObservation,
): OperatorGuidanceDto {
  const { state } = ctx;
  state.operatorAnswers.set(field.name, answer);
  state.filled.set(field.name, answer);
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

async function ask(
  ctx: EngineContext,
  field: RoutedField,
  observation: PageObservation,
): Promise<FieldResult> {
  const { deps, state } = ctx;
  await deps.browser.highlight(field.field.ref).catch(() => undefined);
  const reply = await deps.operator.ask({
    field: field.field,
    suggestion: field.value,
    why: [field.reason, ...field.faults].join(' — '),
    task: state.tasks.open?.label ?? null,
    page: observation.title,
  });
  switch (reply.kind) {
    case 'stop':
      return result(field, 'ask-operator', 'operator', null, 'stop');
    case 'blank':
      return result(field, 'leave-blank', 'operator', null, 'blank');
    case 'answer': {
      const filled = await fill(ctx, field, reply.text, 'operator', 'answer');
      if (filled.outcome !== 'ok') return filled;
      return { ...filled, guidance: remember(ctx, field.field, reply.text, observation) };
    }
    case 'read-back': {
      const value = await deps.browser.readValue(field.field.ref);
      if (value === null || value === '') {
        return result(field, 'leave-blank', 'operator', null, 'read-back', 'ok', 'left empty');
      }
      return {
        ...result(field, 'fill', 'operator', value, 'read-back'),
        guidance: remember(ctx, field.field, value, observation),
      };
    }
  }
}

const day = (at: Date): string => at.toISOString().slice(0, 10);

/**
 * One operator answer handed to the memory as soon as it is given, as its
 * own guidance document, the orchestration id written onto the decision row
 * it came from. At once rather than when the unit of work closes: measured
 * 2026-10-07, a unit that never closed taught nothing, and the one answer
 * the memory lacked would have been asked again the next session.
 */
async function teach(
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
    const { orchestrationRunId } = await deps.brain.teach(document);
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

/** A field that still holds what this session settled for it: kept, with no run and no touch. */
const keptReadout = (field: FieldSpec, position: number): RoutedField => ({
  position,
  field,
  answer: null,
  route: 'keep',
  value: field.value,
  source: 'engine',
  reason: 'holds what this session settled for it',
  faults: [],
  cached: true,
});

const settle = (
  ctx: EngineContext,
  field: RoutedField,
  observation: PageObservation,
): Promise<FieldResult> => {
  switch (field.route) {
    case 'leave-blank':
      return Promise.resolve(result(field, 'leave-blank', field.source, null, null));
    case 'keep':
      if (field.value !== null) ctx.state.filled.set(field.field.name, field.value);
      return Promise.resolve(result(field, 'keep', field.source, field.value, null));
    case 'fill':
      return fill(ctx, field, field.value ?? '', field.source, null);
    case 'ask-operator':
      return ask(ctx, field, observation);
  }
};

const decisionOf = (
  field: RoutedField,
  outcome: FieldResult,
  decided: FieldsDecided | null,
  durationMs: number,
): DecisionInput => ({
  kind: 'field-answer',
  source: outcome.source,
  loopRunId: decided?.runId ?? null,
  loopOrchestrationId: decided?.orchestrationRunId ?? null,
  ref: field.field.ref,
  question: field.field.name,
  answer: outcome.value,
  confidence: field.answer?.confidence ?? null,
  durationMs,
  payload: {
    route: outcome.route,
    routed: field.route,
    reason: field.reason,
    faults: field.faults,
    decision: field.answer?.decision ?? null,
    basis: field.answer?.basis ?? [],
    suggestion: field.value,
    admission: decided?.admission ?? null,
    reply: outcome.reply,
    cached: field.cached,
    outcome: outcome.outcome,
    detail: outcome.detail,
    required: field.field.required,
    hiddenTraits: field.field.hiddenTraits,
  },
});

/**
 * The step's history line: what became of the listed fields, the ones not
 * reached counted too. A field the operator was asked about is counted as
 * asked whatever its row says afterwards — an answer turns the row into a
 * fill from the operator — so the four counts are disjoint and the asks are
 * never read as none. Measured 2026-10-08: one field went to the operator,
 * who answered, and the note read "0 asked".
 */
const summarize = (results: readonly FieldResult[], listed: number): string => {
  const asked = results.filter((r) => r.reply !== null);
  const answered = asked.filter((r) => r.reply === 'answer' || r.reply === 'read-back').length;
  const count = (route: FieldRoute): number =>
    results.filter((r) => r.reply === null && r.route === route && r.outcome === 'ok').length;
  const failed = results.filter((r) => r.outcome === 'failed').length;
  const unattempted = listed - results.length;
  return `${listed} field(s): ${count('fill')} filled, ${count('keep')} kept, ${asked.length} asked${
    asked.length > 0 ? ` (${answered} answered by the operator)` : ''
  }, ${count('leave-blank')} blank${failed > 0 ? `, ${failed} failed` : ''}${
    unattempted > 0 ? `, ${unattempted} not attempted` : ''
  }`;
};

/** The listed fields the refs name, in the order asked. */
const fieldsOf = (refs: readonly string[], observation: PageObservation): FieldSpec[] =>
  refs.flatMap((ref) => {
    const element = observation.elements.find((candidate) => candidate.ref === ref);
    return element === undefined ? [] : [fieldSpecOf(element)];
  });

/** The fields still open: one that holds what this session settled for it is not a question. */
const openOf = (fields: readonly FieldSpec[], filled: ReadonlyMap<string, string>): FieldSpec[] =>
  fields.filter(
    (field) =>
      !(field.value !== null && field.value !== '' && filled.get(field.name) === field.value),
  );

/** The brain's answers for the open fields, or the fault it threw, timed; nothing is asked for no open field. */
async function decideFields(
  ctx: EngineContext,
  open: readonly FieldSpec[],
): Promise<{ decided: FieldsDecided | null; fault: BrainFaulted | null; durationMs: number }> {
  const { deps, state } = ctx;
  const startedAt = deps.clock.now();
  let decided: FieldsDecided | null = null;
  let fault: BrainFaulted | null = null;
  if (open.length > 0) {
    try {
      decided = await deps.brain.answerFields({
        mission: ctx.mission,
        task:
          state.tasks.open === null
            ? null
            : { label: state.tasks.open.label, url: state.tasks.open.url },
        fields: open,
        criteria: ctx.criteria.answer,
      });
    } catch (error) {
      if (!(error instanceof BrainFaulted)) throw error;
      fault = error;
      state.brainFaults += 1;
    }
  }
  return { decided, fault, durationMs: deps.clock.now().getTime() - startedAt.getTime() };
}

/** Every listed field with its route: the one the answers routed, or a keep for one that was never a question. */
const routedOf = (fields: readonly FieldSpec[], answered: readonly RoutedField[]): RoutedField[] =>
  fields.map((field, position) => {
    const found = answered.find((candidate) => candidate.field.ref === field.ref);
    return found === undefined ? keptReadout(field, position) : { ...found, position };
  });

/** Each routed field settled in order and recorded, the operator's guidance taught; a stop or a failure ends the page. */
async function settleAll(
  ctx: EngineContext,
  routed: readonly RoutedField[],
  observation: PageObservation,
  decided: FieldsDecided | null,
  durationMs: number,
): Promise<{ results: FieldResult[]; stopped: boolean }> {
  const results: FieldResult[] = [];
  for (const field of routed) {
    const outcome = await settle(ctx, field, observation);
    results.push(outcome);
    const decisionId = ctx.record(decisionOf(field, outcome, decided, durationMs));
    if (outcome.guidance !== null) await teach(ctx, decisionId, outcome.guidance);
    if (outcome.reply === 'stop') return { results, stopped: true };
    if (outcome.outcome === 'failed') break;
  }
  return { results, stopped: false };
}

/** The step's fields file: what was decided, how each field was routed, and what became of it. */
function dumpFields(
  ctx: EngineContext,
  routed: readonly RoutedField[],
  results: readonly FieldResult[],
  decided: FieldsDecided | null,
  fault: BrainFaulted | null,
): void {
  ctx.dumpFiles('fields', [
    stepJsonFile(ctx.state.step, 'fields', {
      runId: decided?.runId ?? null,
      orchestrationRunId: decided?.orchestrationRunId ?? null,
      admission: decided?.admission ?? null,
      composition: decided?.composition ?? null,
      fault: fault === null ? null : { reason: fault.reason, message: fault.message },
      fields: routed.map((field, position) => ({
        ...field,
        result: results[position] ?? null,
      })),
    }),
  ]);
}

export async function askFields(
  ctx: EngineContext,
  refs: readonly string[],
  observation: PageObservation,
): Promise<FieldsOutcome> {
  const fields = fieldsOf(refs, observation);
  if (fields.length === 0)
    return { stopped: false, failed: false, note: 'no listed field matched' };
  const open = openOf(fields, ctx.state.filled);
  const { decided, fault, durationMs } = await decideFields(ctx, open);
  const routed = routedOf(
    fields,
    routeFieldsInSession(decided, fault, open, ctx.state.operatorAnswers),
  );
  const { results, stopped } = await settleAll(ctx, routed, observation, decided, durationMs);
  dumpFields(ctx, routed, results, decided, fault);
  return {
    stopped,
    failed: results.some((outcome) => outcome.outcome === 'failed'),
    note: summarize(results, routed.length),
  };
}
