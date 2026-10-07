import {
  routeFields,
  type Admission,
  type FieldReadout,
  type FieldSpec,
  type FieldType,
  type QualityRunDto,
} from '@sysdesign/contracts';

import type { BrainFaulted } from './ports';

/**
 * The contracts' route table, with the one thing only a running session
 * knows: what the operator already answered. A field the operator settled
 * earlier in the session — the same label on a later form — is filled with
 * that answer rather than asked again, and the row says so. The precedence
 * the contracts declare is untouched: a hidden field stays blank before the
 * cache is consulted, because the cache only ever stands in for an ask.
 */
export interface RoutedField extends FieldReadout {
  /** True when the operator's earlier answer filled the field. */
  cached: boolean;
}

/** The operator's answer standing in for an ask; every other readout is passed through. */
export function withOperatorCache(
  readouts: readonly FieldReadout[],
  cache: ReadonlyMap<string, string>,
): RoutedField[] {
  return readouts.map((readout) => {
    const cached = readout.route === 'ask-operator' ? cache.get(readout.field.name) : undefined;
    if (cached === undefined) return { ...readout, cached: false };
    return {
      ...readout,
      route: 'fill',
      value: cached,
      source: 'operator',
      reason: `the operator answered "${readout.field.name}" earlier this session`,
      cached: true,
    };
  });
}

/** With no run to read — the brain faulted — a required field goes to the operator and an optional one is left blank; the row says why. */
export function faultedReadouts(fields: readonly FieldSpec[], fault: BrainFaulted): FieldReadout[] {
  return fields.map((field, position) => {
    const hidden = field.hiddenTraits.length > 0;
    const reason = `brain ${fault.reason}: ${fault.message}`;
    return {
      position,
      field,
      answer: null,
      route: hidden || !field.required ? 'leave-blank' : 'ask-operator',
      value: null,
      source: hidden ? 'blank' : 'engine',
      reason: hidden
        ? 'trap-skipped: the page hides this field'
        : field.required
          ? reason
          : `optional, left blank: ${reason}`,
      faults: [],
    };
  });
}

/** One route per field for the session: the contracts' table, then the operator's cache. */
export function routeFieldsInSession(
  decided: { run: QualityRunDto; admission: Admission } | null,
  fault: BrainFaulted | null,
  fields: readonly FieldSpec[],
  cache: ReadonlyMap<string, string>,
): RoutedField[] {
  const readouts =
    decided !== null
      ? routeFields(decided.run, decided.admission, fields)
      : fault !== null
        ? faultedReadouts(fields, fault)
        : [];
  return withOperatorCache(readouts, cache);
}

/** A field's control kind for the operator's prompt and the guidance record, from its role and input type. */
const FIELD_TYPE_BY_ROLE: Readonly<Record<string, FieldType>> = {
  searchbox: 'text',
  spinbutton: 'number',
  combobox: 'select',
  listbox: 'select',
  radiogroup: 'radio',
  radio: 'radio',
  checkbox: 'checkbox',
};

const FIELD_TYPE_BY_INPUT: Readonly<Record<string, FieldType>> = {
  number: 'number',
  date: 'date',
  file: 'file',
  select: 'select',
  textarea: 'textarea',
  checkbox: 'checkbox',
  radio: 'radio',
};

export function fieldTypeOf(field: Pick<FieldSpec, 'role' | 'inputType'>): FieldType {
  const byRole = FIELD_TYPE_BY_ROLE[field.role];
  if (byRole !== undefined) return byRole;
  if (field.inputType !== null) return FIELD_TYPE_BY_INPUT[field.inputType] ?? 'text';
  return field.role === 'textbox' ? 'text' : 'unknown';
}
