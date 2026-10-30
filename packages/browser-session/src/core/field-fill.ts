import {
  elementKind,
  fieldLabelOf,
  fieldQuestionOf,
  type BrowserDecisionSource,
  type FieldRoute,
  type FieldSpec,
  type OperatorGuidanceDto,
  type PageObservation,
} from '@sysdesign/contracts';

import { describeAction } from './action-words';
import { captureAfter } from './capture';
import type { EngineContext } from './engine-context';
import type { RoutedField } from './field-routing';
import type { AnswerSource, OperatorReply } from './operator-interaction';
import { ActionFailed, type BrowserAction } from './ports';
import { openUnitFilled } from './session-state';

/**
 * Putting one value into one field, and what came of it: the action that
 * takes it — an option for a selectable field, text otherwise — taken and
 * imaged, the value kept for the open unit of work as what this field now holds, and
 * the result a field's decision row is written from. A fill the page refuses
 * is a result, never a throw; what follows a refusal is the flow's to decide.
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
  /** The channel the operator answered on, and what the answer was chosen from; null when nobody was asked. */
  via: string | null;
  chosen: AnswerSource | null;
  cached: boolean;
  detail: string | null;
  /** The answer the operator gave here, taught back as soon as it was given. */
  guidance: OperatorGuidanceDto | null;
  /** The run whose suggestion was typed, when the value came from one rather than from the answers run. */
  filledFrom: { runId: string | null; orchestrationRunId: string | null } | null;
}

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

export const result = (
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
  via: null,
  chosen: null,
  cached: field.cached,
  detail,
  guidance: null,
  filledFrom: null,
});

/** What the session settled for a field, kept by what the field asks; one that asks nothing it can be told by is kept by nothing. */
export const settled = (into: Map<string, string>, field: FieldSpec, value: string): void => {
  const key = fieldQuestionOf(field);
  if (key !== null) into.set(key, value);
};

/** A field entry as its capture names it: the action as the history reads it, the field by what a person calls it. */
export const entryOf = (field: FieldSpec, action: BrowserAction, observation: PageObservation) => ({
  label: describeAction(action, observation),
  touched: fieldLabelOf(field) ?? field.role,
});

/** The page refused the fill: the result says so, and the caller stops. */
export async function fill(
  ctx: EngineContext,
  field: RoutedField,
  value: string,
  source: BrowserDecisionSource,
  reply: OperatorReply['kind'] | null,
  observation: PageObservation,
): Promise<FieldResult> {
  const action = fillActionOf(field.field, value);
  const entry = entryOf(field.field, action, observation);
  try {
    await ctx.deps.browser.act(action);
  } catch (error) {
    if (!(error instanceof ActionFailed)) throw error;
    await captureAfter(ctx, action, entry, 'failed');
    return result(field, 'fill', source, value, reply, 'failed', error.message);
  }
  await captureAfter(ctx, action, entry, 'ok');
  settled(openUnitFilled(ctx.state), field.field, value);
  return result(field, 'fill', source, value, reply);
}
