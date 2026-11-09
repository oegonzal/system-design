/**
 * The advisor protocol: how a session asks a domain service what it knows of
 * units beyond this session, and how the service says who it is. Three routes
 * any tenant implements the same way — the descriptor answers who the advisor
 * is and which facts it keeps its record by, the advice answers the units on
 * record for a subject, bounded and the rest counted, and the lookup answers
 * for one identity whether it is on record, so a unit past the advice's bound
 * is still refused at taskStart — and nothing in any names a domain: the facts
 * are the mission's declared facets, the stances the engine's, the asker the
 * run-opener shape every caller already names itself by.
 */
import { z } from 'zod';

import { bounded } from '../bounds';
import { DOCUMENT_SUBJECT_MAX_LENGTH } from '../quality-loop/document-digest';
import {
  RUN_OPENER_ID_MAX_LENGTH,
  RUN_OPENER_KINDS,
  RUN_OPENER_LABEL_MAX_LENGTH,
} from '../quality-loop/runs';
import { unitIdentitySchema } from './identity';
import { unitOnRecordSchema } from './record';
import {
  ADVICE_UNITS_BOUND,
  ADVISOR_ID_MAX_LENGTH,
  UNIT_FACET_NAME_MAX_LENGTH,
  UNIT_FACETS_BOUND,
} from './vocab';

/** The three routes on an advisor's base URL. */
export const ADVISOR_ROUTES = {
  describe: '/advisor',
  advice: '/advice',
  lookup: '/advice/lookup',
} as const;

const advisorId = bounded.id(ADVISOR_ID_MAX_LENGTH, { min: 1 });
const facetNames = bounded.list(
  UNIT_FACETS_BOUND,
  bounded.id(UNIT_FACET_NAME_MAX_LENGTH, { min: 1 }),
);

/** Who an advisor is, and which declared facts it keeps its record by: resolved against the mission before a session opens. */
export const advisorDescriptorSchema = z.strictObject({ id: advisorId, facets: facetNames });
export type AdvisorDescriptor = z.infer<typeof advisorDescriptorSchema>;

/** Who is asking, in the shape every caller names itself by on the runs it opens. */
const askerSchema = z.strictObject({
  kind: z.enum(RUN_OPENER_KINDS),
  id: bounded.id(RUN_OPENER_ID_MAX_LENGTH, { min: 1 }),
  label: bounded.id(RUN_OPENER_LABEL_MAX_LENGTH),
});

export const unitAdviceRequestSchema = z.strictObject({
  /** Whose record: the partition the asker acts under. */
  subject: bounded.id(DOCUMENT_SUBJECT_MAX_LENGTH, { min: 1 }),
  asker: askerSchema,
  /** The facts the asker compares identities by: the advisor's own, each declared by the mission. */
  facets: facetNames,
});
export type UnitAdviceRequest = z.infer<typeof unitAdviceRequestSchema>;

/** What an advisor answers: the units on record by identity and stance, at most `ADVICE_UNITS_BOUND`, the rest counted. */
export const unitAdviceSchema = z.strictObject({
  advisor: advisorId,
  units: bounded.list(ADVICE_UNITS_BOUND, unitOnRecordSchema),
  omitted: z.number().int().nonnegative(),
});
export type UnitAdvice = z.infer<typeof unitAdviceSchema>;

/** One identity asked about by itself: the advice request, plus the facets and values a claim carries. */
export const unitLookupRequestSchema = unitAdviceRequestSchema.extend({
  identity: unitIdentitySchema,
});
export type UnitLookupRequest = z.infer<typeof unitLookupRequestSchema>;

/** What an advisor answers for one identity: the unit on record under it, or null when the record says nothing of it. */
export const unitLookupSchema = z.strictObject({
  advisor: advisorId,
  unit: unitOnRecordSchema.nullable(),
});
export type UnitLookup = z.infer<typeof unitLookupSchema>;
