import {
  elementKindOf,
  fieldSpecOf,
  GUIDANCE_ANSWER_MAX_LENGTH,
  GUIDANCE_PAGE_MAX_LENGTH,
  type Admission,
  type BrowserDecisionSource,
  type FieldAnswers,
  type FieldRoute,
  type FieldSpec,
  type OperatorGuidanceDto,
  type PageObservation,
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
import { clip } from './text';

/**
 * A plan's `askFields`: the fields go to the form-memory orchestration as
 * one goal, the answers come back as one run, and each field is routed by
 * the declared table — filled, left blank, or put to the operator with the
 * model's value as a suggestion and the reason it was not trusted. The
 * operator's answers are cached for the session and kept for the unit of
 * work, which teaches them back when it closes. One decision row per field
 * settled. A fill the page refuses stops the flow where it is — the page may
 * have moved on — so the fields after it are not attempted, and the plan
 * stops with it; the failure is counted once, by the step.
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
  /** The answer the operator gave here, to be taught back when the unit of work closes. */
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
  elementKindOf(field.role) === 'selectable'
    ? { kind: 'select', ref: field.ref, option: value, reason: 'field answer', expect: null }
    : { kind: 'fill', ref: field.ref, value, reason: 'field answer', expect: null };

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
    return result(field, 'fill', source, value, reply);
  } catch (error) {
    if (!(error instanceof ActionFailed)) throw error;
    return result(field, 'fill', source, value, reply, 'failed', error.message);
  }
}

/** Keep what the operator said for the next form that asks the same; answer the item the unit of work teaches back. */
function remember(
  ctx: EngineContext,
  field: FieldSpec,
  answer: string,
  observation: PageObservation,
): OperatorGuidanceDto {
  const { state } = ctx;
  state.operatorAnswers.set(field.name, answer);
  const page = clip(observation.title, GUIDANCE_PAGE_MAX_LENGTH);
  return {
    sessionId: state.sessionId,
    capturedAt: ctx.deps.clock.now().toISOString(),
    field: {
      label: field.name,
      question: field.context,
      type: fieldTypeOf(field),
      options: field.options,
    },
    context: { taskLabel: state.tasks.open?.label ?? null, page: page === '' ? null : page },
    answer: clip(answer, GUIDANCE_ANSWER_MAX_LENGTH),
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

const settle = (
  ctx: EngineContext,
  field: RoutedField,
  observation: PageObservation,
): Promise<FieldResult> => {
  switch (field.route) {
    case 'leave-blank':
      return Promise.resolve(result(field, 'leave-blank', field.source, null, null));
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

/** The step's history line: what became of the listed fields, the ones not reached counted too. */
const summarize = (results: readonly FieldResult[], listed: number): string => {
  const count = (route: FieldRoute): number =>
    results.filter((r) => r.route === route && r.outcome === 'ok').length;
  const failed = results.filter((r) => r.outcome === 'failed').length;
  const unattempted = listed - results.length;
  return `${listed} field(s): ${count('fill')} filled, ${count('ask-operator')} asked, ${count('leave-blank')} blank${
    failed > 0 ? `, ${failed} failed` : ''
  }${unattempted > 0 ? `, ${unattempted} not attempted` : ''}`;
};

export async function askFields(
  ctx: EngineContext,
  refs: readonly string[],
  observation: PageObservation,
): Promise<FieldsOutcome> {
  const { deps, state } = ctx;
  const fields = refs.flatMap((ref) => {
    const element = observation.elements.find((candidate) => candidate.ref === ref);
    return element === undefined ? [] : [fieldSpecOf(element)];
  });
  if (fields.length === 0)
    return { stopped: false, failed: false, note: 'no listed field matched' };

  const startedAt = deps.clock.now();
  let decided: FieldsDecided | null = null;
  let fault: BrainFaulted | null = null;
  try {
    decided = await deps.brain.answerFields({
      mission: ctx.mission,
      task:
        state.tasks.open === null
          ? null
          : { label: state.tasks.open.label, url: state.tasks.open.url },
      fields,
      criteria: ctx.criteria.answer,
    });
  } catch (error) {
    if (!(error instanceof BrainFaulted)) throw error;
    fault = error;
    state.brainFaults += 1;
  }
  const durationMs = deps.clock.now().getTime() - startedAt.getTime();

  const routed = routeFieldsInSession(decided, fault, fields, state.operatorAnswers);
  const results: FieldResult[] = [];
  let stopped = false;
  for (const field of routed) {
    const outcome = await settle(ctx, field, observation);
    results.push(outcome);
    const decisionId = ctx.record(decisionOf(field, outcome, decided, durationMs));
    if (outcome.guidance !== null) state.guidance.push({ decisionId, item: outcome.guidance });
    if (outcome.reply === 'stop') {
      stopped = true;
      break;
    }
    if (outcome.outcome === 'failed') break;
  }
  ctx.dumpFiles('fields', [
    stepJsonFile(state.step, 'fields', {
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
  return {
    stopped,
    failed: results.some((outcome) => outcome.outcome === 'failed'),
    note: summarize(results, routed.length),
  };
}
