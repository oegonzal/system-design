import type { FieldSpec } from '@sysdesign/contracts';

import type { RoutedField } from './field-routing';

/**
 * A field this session left blank, as the open unit remembers it: by where it
 * is and what it is called — its ref on the page, its role and its own name —
 * never by the words around it. The page's refusal adds its own words there
 * ("Mobile Number is required", measured 2026-11-06), and a key that read
 * them would never meet the field again.
 */
export const leftBlankKeyOf = (field: Pick<FieldSpec, 'ref' | 'role' | 'name'>): string =>
  [field.ref, field.role, field.name.replace(/\s+/g, ' ').trim()].join('\u0000');

/** Whether a field left blank is remembered: not one the page hides, and not one the answer chose to leave blank. */
export const remembersBlank = (field: RoutedField): boolean =>
  field.field.hiddenTraits.length === 0 && field.answer?.decision !== 'leave-blank';

/**
 * A field this session left blank in this unit of work and the plan asks
 * again is needed: the page would not go on without it, whatever its markup
 * says, so it is asked as required — answered from the evidence, else put to
 * the operator.
 */
export const neededAgain = (
  fields: readonly FieldSpec[],
  leftBlank: ReadonlyMap<string, string>,
): FieldSpec[] =>
  fields.map((field) =>
    !field.required && leftBlank.has(leftBlankKeyOf(field)) ? { ...field, required: true } : field,
  );
