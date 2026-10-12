import {
  fieldKeyOf,
  fieldSpecOf,
  type FieldAnswers,
  type FieldRoute,
  type FieldSpec,
  type PageObservation,
  excerpt,
  quoted,
} from '@sysdesign/contracts';

import { captureAfter } from './capture';
import type { DecisionInput, EngineContext } from './engine-context';
import { routeFieldsInSession, type RoutedField } from './field-routing';
import { entryOf, fill, fillActionOf, result, settled, type FieldResult } from './field-fill';
import { remember, teach } from './field-teach';
import { askOperator, SuggestionsPrefetch, type SuggestionsRecord } from './operator-ask';
import { BrainFaulted, type Decided, type FormReport } from './ports';
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
 * with it; the failure is counted once, by the step. The operator's own
 * answer is put back to them first, as the operator settings declare.
 */
export interface FieldsOutcome {
  stopped: boolean;
  failed: boolean;
  note: string;
}

type FieldsDecided = Decided<FieldAnswers> & FormReport;

/** How much of a refused answer the question it comes back with quotes. */
const REFUSED_ANSWER_QUOTED = 80;

/**
 * The operator's answer to a field. An answer the page refuses is put back,
 * with why, as many times as the operator settings declare — the person can
 * choose again, or fix the field in the browser and have it read back, which
 * keeps and teaches what they chose — and only past that does the refusal
 * stand. Measured 2026-10-11: a refused answer the operator then fixed by hand
 * was never recorded, and the next form asked the same question again.
 */
async function ask(
  ctx: EngineContext,
  field: RoutedField,
  observation: PageObservation,
  prefetch: SuggestionsPrefetch | null,
): Promise<FieldResult> {
  const { deps, state } = ctx;
  await deps.browser.highlight(field.field.ref).catch(() => undefined);
  let refusal: string | null = null;
  for (let asked = 0; ; asked += 1) {
    const { answer, reply, chosen } = await askOperator(
      ctx,
      {
        field: field.field,
        // A refused answer is not offered back; the question says why it returned.
        untrusted: refusal === null ? field.value : null,
        why: refusal ?? [field.reason, ...field.faults].join(' — '),
        task: state.tasks.open?.label ?? null,
        page: observation.title,
      },
      prefetch,
    );
    const asking = { via: answer.via.channel, chosen };
    switch (reply.kind) {
      case 'stop':
        return { ...result(field, 'ask-operator', 'operator', null, 'stop'), ...asking };
      case 'blank':
        return { ...result(field, 'leave-blank', 'operator', null, 'blank'), ...asking };
      case 'answer': {
        const filled = {
          ...(await fill(ctx, field, reply.text, 'operator', 'answer', observation)),
          ...asking,
        };
        if (filled.outcome === 'ok') {
          return { ...filled, guidance: remember(ctx, field.field, reply.text, observation) };
        }
        if (asked >= ctx.options.asksAfterRefusal) return filled;
        const answered = quoted(excerpt(reply.text, REFUSED_ANSWER_QUOTED));
        refusal = `the page refused ${answered} (${filled.detail ?? 'no reason given'}): choose again, or fill it in the browser and read it back`;
        deps.log(
          `step ${state.step}: ${quoted(field.field.name)} refused ${answered}; asking again`,
        );
        continue;
      }
      case 'read-back': {
        const value = await deps.browser.readValue(field.field.ref);
        if (value === null || value === '') {
          return {
            ...result(field, 'leave-blank', 'operator', null, 'read-back', 'ok', 'left empty'),
            ...asking,
          };
        }
        // What the operator typed into the page is an entry like any other.
        const typed = fillActionOf(field.field, value);
        await captureAfter(ctx, typed, entryOf(field.field, typed, observation), 'ok');
        return {
          ...result(field, 'fill', 'operator', value, 'read-back'),
          ...asking,
          guidance: remember(ctx, field.field, value, observation),
        };
      }
    }
  }
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
  prefetch: SuggestionsPrefetch | null,
): Promise<FieldResult> => {
  switch (field.route) {
    case 'leave-blank':
      return Promise.resolve(result(field, 'leave-blank', field.source, null, null));
    case 'keep':
      if (field.value !== null) settled(ctx.state.filled, field.field, field.value);
      return Promise.resolve(result(field, 'keep', field.source, field.value, null));
    case 'fill':
      return fill(ctx, field, field.value ?? '', field.source, null, observation);
    case 'ask-operator':
      return ask(ctx, field, observation, prefetch);
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
    via: outcome.via,
    chosen: outcome.chosen,
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
  fields.filter((field) => {
    const key = fieldKeyOf(field);
    return !(
      field.value !== null &&
      field.value !== '' &&
      key !== null &&
      filled.get(key) === field.value
    );
  });

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
        session: { sessionId: state.sessionId, step: state.step },
        mission: ctx.mission,
        task:
          state.tasks.open === null
            ? null
            : { label: state.tasks.open.label, url: state.tasks.open.url },
        fields: open,
        criteria: ctx.criteria.answer,
      });
      state.brainFaults = 0;
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
  prefetch: SuggestionsPrefetch | null,
): Promise<{ results: FieldResult[]; stopped: boolean }> {
  const results: FieldResult[] = [];
  for (const field of routed) {
    const outcome = await settle(ctx, field, observation, prefetch);
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
  suggestions: SuggestionsRecord | null,
): void {
  ctx.dumpFiles('fields', [
    stepJsonFile(ctx.state.step, 'fields', {
      runId: decided?.runId ?? null,
      orchestrationRunId: decided?.orchestrationRunId ?? null,
      admission: decided?.admission ?? null,
      composition: decided?.composition ?? null,
      fault: fault === null ? null : { reason: fault.reason, message: fault.message },
      // What became of the suggestions — offered, faulted, or still coming when the form was settled.
      suggestions,
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
  const prefetch = SuggestionsPrefetch.for(ctx, routed);
  const { results, stopped } = await settleAll(
    ctx,
    routed,
    observation,
    decided,
    durationMs,
    prefetch,
  );
  dumpFields(ctx, routed, results, decided, fault, prefetch?.record() ?? null);
  return {
    stopped,
    failed: results.some((outcome) => outcome.outcome === 'failed'),
    note: summarize(results, routed.length),
  };
}
