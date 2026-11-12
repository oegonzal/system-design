import {
  fieldLabelOf,
  fieldQuestionOf,
  fieldSpecOf,
  type FieldAnswers,
  type FieldRoute,
  type FieldSpec,
  type PageObservation,
  excerpt,
  quoted,
  elementByRef,
} from '@sysdesign/contracts';

import { captureAfter } from './capture';
import type { DecisionInput, EngineContext } from './engine-context';
import { withTypedChoices } from './field-choices';
import { blanksOnPage, remembersBlank, type PageBlanks } from './left-blank';
import { routeFieldsInSession, type RoutedField } from './field-routing';
import { entryOf, fill, fillActionOf, result, settled, type FieldResult } from './field-fill';
import { recordTeaching, remember, teach, type Taught } from './field-teach';
import { askOperator, SuggestionsPrefetch, type SuggestionsRecord } from './operator-ask';
import { BrainFaulted, type Decided, type FormReport } from './ports';
import { stepJsonFile } from './session-dump';
import { formTaskOf } from './open-unit';
import { openUnitAnswers, openUnitFilled, openUnitLeftBlank } from './session-state';

/**
 * A plan's `askFields`: the fields go to the form-memory orchestration as
 * one goal — except those that still hold what this session settled for
 * them, which are kept without a run, and those the operator chose to leave
 * blank in the unit, which stay blank without one — the answers come back as one run, and
 * each field is routed by the declared table: filled, kept, left blank, or
 * put to the operator with the model's value as a suggestion and the reason
 * it was not trusted. The operator's answers are cached for the unit of work
 * they were given in and, unless given on a channel the operator settings
 * keep untaught, taught back the moment they are given, the row carrying what
 * the memory did with each. One decision row per field settled.
 * A fill the page refuses stops the flow where it is — the page may have
 * moved on — so the fields after it are not attempted, and the plan stops
 * with it; the step counts a failure only when no field was filled before
 * it. The operator's own answer is put back to them first, as the operator
 * settings declare.
 */
export interface FieldsOutcome {
  stopped: boolean;
  failed: boolean;
  /** A field the page refused: the fields after it were not attempted, so the actions planned after them do not run. */
  refused: boolean;
  note: string;
}

type FieldsDecided = Decided<FieldAnswers> & FormReport;

/** How much of a refused answer the question it comes back with quotes. */
const REFUSED_ANSWER_QUOTED = 80;

/**
 * The operator's answer to a field — or a suggestion the answering settings
 * type in their place, recorded from memory naming the run that drafted it,
 * cached as what the field now holds, and taught to nobody: the record
 * already holds it. An answer the page refuses is put back, with why, as many
 * times as the operator settings declare — the person can choose again, or
 * fix the field in the browser and have it read back, which keeps and teaches
 * what they chose — and only past that does the refusal stand; a typed
 * suggestion the page refused is asked the same way, and never typed again.
 * Measured 2026-10-11: a refused answer the operator then fixed by hand was
 * never recorded, and the next form asked the same question again.
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
    const outcome = await askOperator(
      ctx,
      {
        field: field.field,
        // A refused answer is not offered back; the question says why it returned.
        unfilled: refusal === null ? field.value : null,
        why:
          refusal ??
          [
            field.reason,
            ...field.withheld.map((item) => `${item.by}: ${item.note ?? 'withheld'}`),
          ].join(' — '),
        task: state.tasks.open?.label ?? null,
        page: observation.title,
      },
      prefetch,
      refusal === null,
    );
    // The session is stopping: the field reads as the operator's /stop, and the form loop ends with it.
    if (outcome.kind === 'stopped') return result(field, 'ask-operator', 'operator', null, 'stop');
    if (outcome.kind === 'filled') {
      const { suggestion, run } = outcome;
      const typed = await fill(ctx, field, suggestion.text, 'memory', null, observation);
      if (typed.outcome === 'ok') return { ...typed, chosen: suggestion.basis, filledFrom: run };
      const answered = quoted(excerpt(suggestion.text, REFUSED_ANSWER_QUOTED));
      refusal = `the page refused ${answered}, suggested from your record (${typed.detail ?? 'no reason given'}): choose, or fill it in the browser and read it back`;
      deps.log(`step ${state.step}: ${quoted(field.field.name)} refused ${answered}; asking`);
      continue;
    }
    const { answer, reply, chosen } = outcome;
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
          return {
            ...filled,
            guidance: remember(
              ctx,
              field.field,
              reply.text,
              observation,
              chosen,
              asking.via,
              field.answer?.about ?? null,
            ),
          };
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
          guidance: remember(
            ctx,
            field.field,
            value,
            observation,
            chosen,
            asking.via,
            field.answer?.about ?? null,
          ),
        };
      }
    }
  }
}

/** A field that still holds what this session settled for it in this unit of work: kept, with no run and no touch. */
const keptReadout = (field: FieldSpec, position: number): RoutedField => ({
  position,
  field,
  answer: null,
  route: 'keep',
  value: field.value,
  source: 'engine',
  reason: 'holds what this session settled for it',
  withheld: [],
  cached: true,
});

/** A field the operator chose to leave blank earlier in this unit of work, still holding nothing: blank again, with no run and no ask. */
const operatorBlankReadout = (field: FieldSpec, position: number): RoutedField => ({
  position,
  field,
  answer: null,
  route: 'leave-blank',
  value: null,
  source: 'operator',
  reason: 'the operator chose to leave it blank earlier in this unit of work',
  withheld: [],
  cached: true,
});

const settle = (
  ctx: EngineContext,
  field: RoutedField,
  observation: PageObservation,
  prefetch: SuggestionsPrefetch | null,
  blanks: PageBlanks,
): Promise<FieldResult> => {
  switch (field.route) {
    case 'leave-blank':
      // Remembered, unless the page hides it or the answer chose the blank: asked again, it is asked as required.
      if (remembersBlank(field)) blanks.remember(field.field, 'session');
      return Promise.resolve(result(field, 'leave-blank', field.source, null, null));
    case 'keep':
      if (field.value !== null) settled(openUnitFilled(ctx.state), field.field, field.value);
      return Promise.resolve(result(field, 'keep', field.source, field.value, null));
    case 'fill':
      return fill(ctx, field, field.value ?? '', field.source, null, observation);
    case 'ask-operator':
      return ask(ctx, field, observation, prefetch).then((outcome) => {
        // The operator's own blank is their answer for the unit: the field is not put to them again.
        if (outcome.reply === 'blank') blanks.remember(field.field, 'operator');
        return outcome;
      });
  }
};

const decisionOf = (
  field: RoutedField,
  outcome: FieldResult,
  decided: FieldsDecided | null,
  durationMs: number,
  taught: Taught | null,
): DecisionInput => ({
  kind: 'field-answer',
  source: outcome.source,
  // The run that produced the value: the suggestions run for a typed suggestion, else the answers run.
  loopRunId: outcome.filledFrom?.runId ?? decided?.runId ?? null,
  loopOrchestrationId:
    outcome.filledFrom?.orchestrationRunId ?? decided?.orchestrationRunId ?? null,
  ref: field.field.ref,
  question: field.field.name,
  answer: outcome.value,
  rests: field.answer?.rests ?? null,
  durationMs,
  payload: {
    route: outcome.route,
    routed: field.route,
    reason: field.reason,
    withheld: field.withheld,
    decision: field.answer?.decision ?? null,
    about: field.answer?.about ?? null,
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
    // What the memory did with the operator's answer here, when one was taught; the step's teach file has the rest.
    teaching: taught === null ? null : { ref: taught.ref, outcome: taught.outcome },
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
const summarize = (results: readonly FieldResult[], routed: readonly RoutedField[]): string => {
  const listed = routed.length;
  const asked = results.filter((r) => r.reply !== null);
  const answered = asked.filter((r) => r.reply === 'answer' || r.reply === 'read-back').length;
  const count = (route: FieldRoute): number =>
    results.filter((r) => r.reply === null && r.route === route && r.outcome === 'ok').length;
  const failed = results.filter((r) => r.outcome === 'failed').length;
  // A blank the operator chose earlier in the unit is said as theirs: the next plan does not ask it again.
  const operatorBlanks = results.filter(
    (settled) => settled.route === 'leave-blank' && settled.cached && settled.source === 'operator',
  ).length;
  // The field the page refused, as a person would name it, and why: the next plan answers it, never repeats it.
  const refusal = results.find((r) => r.outcome === 'failed');
  const refused = routed.find((r) => r.field.ref === refusal?.ref);
  const refusedName = (refused === undefined ? null : fieldLabelOf(refused.field)) ?? refusal?.ref;
  const unattempted = listed - results.length;
  return `${listed} field(s): ${count('fill')} filled, ${count('keep')} kept, ${asked.length} asked${
    asked.length > 0 ? ` (${answered} answered by the operator)` : ''
  }, ${count('leave-blank')} blank${
    operatorBlanks > 0
      ? ` (${operatorBlanks} as the operator chose earlier in this unit of work)`
      : ''
  }${failed > 0 ? `, ${failed} failed` : ''}${
    unattempted > 0 ? `, ${unattempted} not attempted` : ''
  }${refusal === undefined ? '' : ` — ${refusedName}: ${refusal.detail ?? 'refused'}`}`;
};

/** The listed fields the refs name, in the order asked. */
const fieldsOf = (refs: readonly string[], observation: PageObservation): FieldSpec[] =>
  refs.flatMap((ref) => {
    const element = elementByRef(observation.elements, ref);
    return element === undefined ? [] : [fieldSpecOf(element)];
  });

/** The fields still open: one that holds what this session settled for it in this unit of work is not a question. */
const openOf = (fields: readonly FieldSpec[], filled: ReadonlyMap<string, string>): FieldSpec[] =>
  fields.filter((field) => {
    const key = fieldQuestionOf(field);
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
        task: formTaskOf(state),
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

/**
 * Every listed field with its route: the one the answers routed, else the
 * operator's earlier blank, else a keep for one that was never a question.
 */
const routedOf = (
  fields: readonly FieldSpec[],
  answered: readonly RoutedField[],
  blanks: PageBlanks,
): RoutedField[] =>
  fields.map((field, position) => {
    const found = answered.find((candidate) => candidate.field.ref === field.ref);
    if (found !== undefined) return { ...found, position };
    return blanks.blankedByOperator(field)
      ? operatorBlankReadout(field, position)
      : keptReadout(field, position);
  });

/** Each routed field settled in order and recorded, the operator's guidance taught; a stop or a failure ends the page. */
async function settleAll(
  ctx: EngineContext,
  routed: readonly RoutedField[],
  observation: PageObservation,
  decided: FieldsDecided | null,
  durationMs: number,
  prefetch: SuggestionsPrefetch | null,
  blanks: PageBlanks,
): Promise<{ results: FieldResult[]; stopped: boolean }> {
  const results: FieldResult[] = [];
  for (const field of routed) {
    const outcome = await settle(ctx, field, observation, prefetch, blanks);
    results.push(outcome);
    if (outcome.outcome === 'ok' && (outcome.value ?? '') !== '') blanks.answered(field.field);
    // The answer is taught before its row is written, so the row carries what the memory did with it.
    const taught = outcome.guidance === null ? null : await teach(ctx, outcome.guidance);
    const decisionId = ctx.record(decisionOf(field, outcome, decided, durationMs, taught));
    if (taught !== null) recordTeaching(ctx, decisionId, taught);
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
      // What the brain's recall did for this form, as it reports it; null from a brain whose recall is the loop's own.
      recall: decided?.recall ?? null,
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
  const blanks = blanksOnPage(openUnitLeftBlank(ctx.state), observation.url);
  const fields = blanks.neededAgain(fieldsOf(refs, observation));
  if (fields.length === 0)
    return { stopped: false, failed: false, refused: false, note: 'no listed field matched' };
  const unanswered = openOf(fields, openUnitFilled(ctx.state)).filter(
    (field) => !blanks.blankedByOperator(field),
  );
  const open = await withTypedChoices(ctx.deps.browser, unanswered);
  const { decided, fault, durationMs } = await decideFields(ctx, open);
  const routed = routedOf(
    fields,
    routeFieldsInSession(decided, fault, open, openUnitAnswers(ctx.state), ctx.options.answering),
    blanks,
  );
  const prefetch = SuggestionsPrefetch.for(ctx, routed);
  const { results, stopped } = await settleAll(
    ctx,
    routed,
    observation,
    decided,
    durationMs,
    prefetch,
    blanks,
  );
  dumpFields(ctx, routed, results, decided, fault, prefetch?.record() ?? null);
  return {
    stopped,
    // A refusal after a field was filled is a step that ran: the page moved, the note names the refused field, and
    // the next plan answers it in the words the page offered. Measured 2026-11-06: three such steps, four fields
    // filled between them, ended a session at the failure limit with the form one select short of sending.
    failed:
      results.some((outcome) => outcome.outcome === 'failed') &&
      !results.some((outcome) => outcome.outcome === 'ok' && outcome.route === 'fill'),
    refused: results.some((outcome) => outcome.outcome === 'failed'),
    note: summarize(results, routed),
  };
}
