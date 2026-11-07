import type { FieldSpec } from '@sysdesign/contracts';

import type { RoutedField } from './field-routing';
import { pageOf } from './session-state';

/** Who left a field blank, as the open unit remembers it: the session's routing, or the operator's own choice. */
export type BlankedBy = 'session' | 'operator';

/** A blank the open unit remembers: who left it, and what the field read then — nothing, or what the page put there. */
export interface LeftBlank {
  by: BlankedBy;
  held: string | null;
}

/**
 * A field left blank, as the open unit remembers it: by the page it is on and
 * by where it is there and what it is called — its ref, its role and its own
 * name — never by the words around it. The page's refusal adds its own words
 * there ("Mobile Number is required", measured 2026-11-06), and a key that
 * read them would never meet the field again.
 */
const leftBlankKeyOf = (url: string, field: Pick<FieldSpec, 'ref' | 'role' | 'name'>): string =>
  [pageOf(url), field.ref, field.role, field.name.replace(/\s+/g, ' ').trim()].join('\u0000');

/** Whether a field left blank is remembered: not one the page hides, and not one the answer chose to leave blank. */
export const remembersBlank = (field: RoutedField): boolean =>
  field.field.hiddenTraits.length === 0 && field.answer?.decision !== 'leave-blank';

/** The blanks the open unit remembers, read and written for the fields of one page. */
export interface PageBlanks {
  /**
   * The fields as asked: one left blank in the unit that the plan asks again
   * is needed — the page would not go on without it, whatever its markup
   * says — so it is asked as required, answered from the evidence, else put
   * to the operator.
   */
  neededAgain(fields: readonly FieldSpec[]): FieldSpec[];
  /**
   * Whether the operator chose to leave the field blank and it still reads as
   * it did then — nothing, a site's prefill, a box unticked: their answer
   * stands, it is not put to them again nor to the brain, and a page that
   * will not go on without it is the mission's to settle. Measured
   * 2026-11-06: three required questions the operator left blank were put to
   * them five more times, and one session waited 24 minutes on a question
   * already answered "leave it empty".
   */
  blankedByOperator(field: FieldSpec): boolean;
  /** A blank remembered with what the field read; the operator's own choice is never written over by the session's. */
  remember(field: FieldSpec, by: BlankedBy): void;
  /** A value settled into the field: the operator's blank is spent, while the field stays one the page needed. */
  answered(field: FieldSpec): void;
}

export const blanksOnPage = (leftBlank: Map<string, LeftBlank>, url: string): PageBlanks => {
  const keyOf = (field: FieldSpec): string => leftBlankKeyOf(url, field);
  return {
    neededAgain: (fields) =>
      fields.map((field) =>
        !field.required && leftBlank.has(keyOf(field)) ? { ...field, required: true } : field,
      ),
    blankedByOperator: (field) => {
      const blank = leftBlank.get(keyOf(field));
      return blank?.by === 'operator' && (field.value ?? '') === (blank.held ?? '');
    },
    remember: (field, by) => {
      const key = keyOf(field);
      if (by === 'operator' || !leftBlank.has(key)) leftBlank.set(key, { by, held: field.value });
    },
    answered: (field) => {
      const key = keyOf(field);
      const blank = leftBlank.get(key);
      if (blank?.by === 'operator') leftBlank.set(key, { ...blank, by: 'session' });
    },
  };
};
