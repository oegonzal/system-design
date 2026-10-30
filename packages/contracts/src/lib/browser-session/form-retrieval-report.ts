import { z } from 'zod';

import type { ApiResponse } from '../envelope';
import type { MemoryStoreAvailabilityDto, RetrievalHitDto } from '../quality-loop/memory';
import { unitKeySchema } from '../units/identity';
import type { MemoryScope } from '../units/scope';
import { FIELDS_BOUND } from './field-answers.schema';
import { fieldSpecSchema, type EvidenceItem, type FieldSpec } from './field-goal';
import type { FieldType } from './vocab';

/**
 * What a form page's recall would retrieve for its fields, without running a
 * pipeline — the form path's own measurement seam, as the curated path's is
 * the retrieval report. A field is given by what the recall reads of it: what
 * it asks (`name`, `context`) and what kind of control asks (`role`,
 * `inputType`); the rest of a field spec is the answerer's concern and is
 * filled in here as a field no page has touched. The page is given by the
 * unit of work it is for, as a form goal's index names it — absent for a page
 * naming none, which, as in the recall, reads no memory bound to a unit.
 */
export const formRetrievalFieldSchema = fieldSpecSchema
  .pick({ ref: true, role: true, name: true, inputType: true, context: true })
  .partial({ ref: true, role: true, inputType: true, context: true });
export type FormRetrievalField = z.infer<typeof formRetrievalFieldSchema>;

export const formRetrievalRequestSchema = z.strictObject({
  fields: z.array(formRetrievalFieldSchema).min(1).max(FIELDS_BOUND.ceiling),
  unitKey: unitKeySchema.optional(),
});
export type FormRetrievalRequest = z.infer<typeof formRetrievalRequestSchema>;

/** The field as the recall reads it: what was given, the rest as a field no page has filled. */
export const reportFieldSpec = (field: FormRetrievalField, position: number): FieldSpec => ({
  ref: field.ref ?? `f${position + 1}`,
  role: field.role ?? 'textbox',
  name: field.name,
  inputType: field.inputType ?? null,
  options: null,
  optionsOmitted: 0,
  value: null,
  required: false,
  invalid: false,
  maxLength: null,
  hiddenTraits: [],
  context: field.context ?? null,
});

/**
 * A hit as the form report lists it: a retrieval hit with what the store
 * holds it as — its chunk kind, its scope (null on a memory stored without
 * one) and the unit of work it was recorded for (null on any memory not bound
 * to one) — so a reader checks what the search let through without reading
 * the store beside it.
 */
export interface FormRetrievalHitDto extends RetrievalHitDto {
  kind: string;
  scope: MemoryScope | null;
  unitKey: string | null;
}

export interface FormRetrievalFieldDto {
  ref: string;
  type: FieldType;
  /** What the field asks — its probe; null for a field asking nothing, for which nothing is recalled. */
  probe: string | null;
  /** The hits each named vector contributes for this field's kind of control. */
  limit: number;
  /** Each named vector's own ranking of the probe, cosines comparable within one list. */
  ranked: { using: string; hits: FormRetrievalHitDto[] }[];
  /** The field's fused list; `alias` names the hit as the page's evidence would, null for one the cap dealt out. */
  fused: (FormRetrievalHitDto & { alias: string | null })[];
}

export interface FormRetrievalReportDto {
  store: MemoryStoreAvailabilityDto;
  fields: FormRetrievalFieldDto[];
  /** The evidence the page would be composed with, aliased as the goal lists it. */
  evidence: EvidenceItem[];
}

export type FormRetrievalReportResponse = ApiResponse<FormRetrievalReportDto>;
