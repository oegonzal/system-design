import {
  excerpt,
  fieldQuestionOf,
  needsValue,
  quoted,
  routeFields,
  type AnsweringSettings,
  type FieldReadout,
  type FieldsDecision,
  type FieldSpec,
} from '@sysdesign/contracts';

import type { BrainFaulted } from './ports';

/**
 * The contracts' route table, with the one thing only a running session
 * knows: what the operator already answered. A field the operator settled
 * earlier in the same unit of work — the same question on a later form, told
 * apart by `fieldQuestionOf` — is filled with that answer rather than asked
 * again, and the row says so; the session hands in the open unit's answers
 * alone (`openUnitAnswers`). The precedence the contracts declare is
 * untouched: a hidden field stays blank before the cache is consulted,
 * because the cache only ever stands in for an ask.
 */
export interface RoutedField extends FieldReadout {
  /** True when the operator's earlier answer filled the field. */
  cached: boolean;
}

/** How much of the question a cached answer's reason quotes. */
const CACHED_QUESTION_MAX = 120;

/** The operator's answer standing in for an ask; every other readout is passed through. */
export function withOperatorCache(
  readouts: readonly FieldReadout[],
  cache: ReadonlyMap<string, string>,
): RoutedField[] {
  return readouts.map((readout) => {
    const key = fieldQuestionOf(readout.field);
    const cached = readout.route === 'ask-operator' && key !== null ? cache.get(key) : undefined;
    if (key === null || cached === undefined) return { ...readout, cached: false };
    return {
      ...readout,
      route: 'fill',
      value: cached,
      source: 'operator',
      reason: `the operator answered ${quoted(excerpt(key, CACHED_QUESTION_MAX))} earlier this session`,
      cached: true,
    };
  });
}

/** With no run to read — the brain faulted — a field the page needs a value in goes to the operator and any other is left blank; the row says why. */
export function faultedReadouts(fields: readonly FieldSpec[], fault: BrainFaulted): FieldReadout[] {
  return fields.map((field, position) => {
    const hidden = field.hiddenTraits.length > 0;
    const reason = `brain ${fault.reason}: ${fault.message}`;
    return {
      position,
      field,
      answer: null,
      route: hidden || !needsValue(field) ? 'leave-blank' : 'ask-operator',
      value: null,
      source: hidden ? 'blank' : 'engine',
      reason: hidden
        ? 'trap-skipped: the page hides this field'
        : needsValue(field)
          ? reason
          : `optional, left blank: ${reason}`,
      withheld: [],
    };
  });
}

/** One route per field for the session: the contracts' table over what the orchestration reported, then the operator's cache. */
export function routeFieldsInSession(
  decided: FieldsDecision | null,
  fault: BrainFaulted | null,
  fields: readonly FieldSpec[],
  cache: ReadonlyMap<string, string>,
  answering: AnsweringSettings,
): RoutedField[] {
  const readouts =
    decided !== null
      ? routeFields(decided, fields, answering)
      : fault !== null
        ? faultedReadouts(fields, fault)
        : [];
  return withOperatorCache(readouts, cache);
}
