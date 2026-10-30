/**
 * How a page's fields become probes, and how what comes back is dealt into
 * the evidence a form goal lists — pure of every store, so the recall that
 * searches a store and the one that asks a memory space deal alike. What a
 * field asks (`fieldQuestionOf`) is its probe: a taught answer's condition is
 * written as that very text, so the stored condition and the next probe are
 * one, and no model is asked to derive one. A probe takes as many hits as the
 * kind of control asking it, by a table the caller declares over every field
 * type; each field's hits are ranked on their own, then dealt out by rank
 * under one cap — every field's best before any field's second — so neither
 * the first fields nor the last are crowded out by a long page.
 */
import { FIELDS_BOUND } from './field-answers.schema';
import { fieldQuestionOf, fieldTypeOf, MAX_EVIDENCE, type FieldSpec } from './field-goal';
import type { FieldType } from './vocab';

/** How many distinct probes one page may search under: as many as the fields a page is asked for. */
export const MAX_FIELD_PROBES = FIELDS_BOUND.target;

/**
 * How many hits a probe takes, by what kind of control asks — a total table,
 * so a new field type is classified or the build refuses. The caller declares
 * it: how deep a free-text field draws is the recall's policy, not the codec's.
 */
export type HitsPerFieldType = Readonly<Record<FieldType, number>>;

/** The hits a field's probe takes, by the kind of control asking. */
export const hitsFor = (
  field: Pick<FieldSpec, 'role' | 'inputType'>,
  budgets: HitsPerFieldType,
): number => budgets[fieldTypeOf(field)];

export interface FieldProbeSet {
  /** Distinct probe texts, in field order. */
  texts: string[];
  /** For each field, the index into `texts` it is searched under; null for a field with nothing to ask, or past the cap. */
  byField: (number | null)[];
  /** For each probe, the hits it takes: the most any field asking it takes. */
  limits: number[];
}

/** One probe per distinct question the page asks, each field pointing at its own. */
export function fieldProbes(
  fields: readonly FieldSpec[],
  budgets: HitsPerFieldType,
): FieldProbeSet {
  const texts: string[] = [];
  const limits: number[] = [];
  const positions = new Map<string, number>();
  const byField = fields.map((field) => {
    const text = fieldQuestionOf(field);
    if (text === null) return null;
    const known = positions.get(text);
    if (known !== undefined) {
      limits[known] = Math.max(limits[known] ?? 0, hitsFor(field, budgets));
      return known;
    }
    if (texts.length === MAX_FIELD_PROBES) return null;
    positions.set(text, texts.length);
    texts.push(text);
    limits.push(hitsFor(field, budgets));
    return texts.length - 1;
  });
  return { texts, byField, limits };
}

/**
 * The evidence for a page dealt out by rank from each field's own ranked list
 * — every field's best in field order, then every field's second — one slot
 * per distinct item by the identity given, capped. Measured 2026-10-10:
 * joined field by field, an eleven-field page spent the cap before its last
 * fields, and the question 37 stored facts about the subject spoke to was
 * asked with none.
 */
export function dealByRank<Item>(
  perField: readonly (readonly Item[])[],
  identity: (item: Item) => string,
  limit = MAX_EVIDENCE,
): Item[] {
  const deepest = Math.max(0, ...perField.map((items) => items.length));
  const seen = new Set<string>();
  const chosen: Item[] = [];
  for (let rank = 0; rank < deepest; rank++) {
    for (const items of perField) {
      const item = items[rank];
      if (item === undefined || seen.has(identity(item))) continue;
      if (chosen.length === limit) return chosen;
      seen.add(identity(item));
      chosen.push(item);
    }
  }
  return chosen;
}
