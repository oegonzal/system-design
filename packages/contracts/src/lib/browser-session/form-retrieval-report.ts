import { z } from 'zod';

import type { ApiResponse } from '../envelope';
import type { MemoryStoreAvailabilityDto, RetrievalHitDto } from '../quality-loop/memory';
import { FIELDS_BOUND } from './field-answers.schema';
import { fieldSpecSchema, type EvidenceItem, type FieldSpec } from './field-goal';
import type { FieldType } from './vocab';

/**
 * What a form page's recall would retrieve for its fields, without running a
 * pipeline — the form path's own measurement seam, as the curated path's is
 * the retrieval report. A field is given by what the recall reads of it: what
 * it asks (`name`, `context`) and what kind of control asks (`role`,
 * `inputType`); the rest of a field spec is the answerer's concern and is
 * filled in here as a field no page has touched.
 */
export const formRetrievalFieldSchema = fieldSpecSchema
  .pick({ ref: true, role: true, name: true, inputType: true, context: true })
  .partial({ ref: true, role: true, inputType: true, context: true });
export type FormRetrievalField = z.infer<typeof formRetrievalFieldSchema>;

export const formRetrievalRequestSchema = z.strictObject({
  fields: z.array(formRetrievalFieldSchema).min(1).max(FIELDS_BOUND.ceiling),
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

export interface FormRetrievalFieldDto {
  ref: string;
  type: FieldType;
  /** What the field asks — its probe; null for a field asking nothing, for which nothing is recalled. */
  probe: string | null;
  /** The hits each named vector contributes for this field's kind of control. */
  limit: number;
  /** Each named vector's own ranking of the probe, cosines comparable within one list. */
  ranked: { using: string; hits: RetrievalHitDto[] }[];
  /** The field's fused list; `alias` names the hit as the page's evidence would, null for one the cap dealt out. */
  fused: (RetrievalHitDto & { alias: string | null })[];
}

export interface FormRetrievalReportDto {
  store: MemoryStoreAvailabilityDto;
  fields: FormRetrievalFieldDto[];
  /** The evidence the page would be composed with, aliased as the goal lists it. */
  evidence: EvidenceItem[];
}

export type FormRetrievalReportResponse = ApiResponse<FormRetrievalReportDto>;
