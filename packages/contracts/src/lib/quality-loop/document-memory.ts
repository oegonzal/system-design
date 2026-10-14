/**
 * The document-memory orchestrator's own wire types: it digests one document
 * chunk into facts about its subject and stores what the digest endorsed. The
 * run itself is an `OrchestrationRunDto`; its context is a `MemoryContextDto`.
 */
import type { z } from 'zod';

import { documentChunkSchema } from './document-digest';

export const DOCUMENT_MEMORY_ORCHESTRATOR_ID = 'document-memory';

/**
 * Why a document-memory step skipped, failed, completed without effect, or
 * completed leaving facts of its chunk out of the store — beyond the runner's
 * own reasons. A digest that was judged and fell short is `not-accepted`; one
 * that was never judged says why instead. `unit-unnamed` is a digest that
 * bound memories to a unit of work in a document that names none: no search
 * would read one, so each is withheld, and the step gives the reason — counted
 * under the same word — whether or not it stored the rest, so a reader tells a
 * chunk whose facts the store could not take from one that holds none
 * (`no-memories`).
 */
export const DOCUMENT_MEMORY_STEP_REASONS = [
  'embeddings-disabled',
  'store-unavailable',
  'embedding-failed',
  'not-accepted',
  'no-rubric',
  'no-artifact',
  'no-memories',
  'unit-unnamed',
] as const;
export type DocumentMemoryStepReason = (typeof DOCUMENT_MEMORY_STEP_REASONS)[number];

/**
 * What the digest step reports: the document it digested, read from the
 * goal's own index — with the scope it declared and the unit of work it
 * names, when it declares them.
 */
export const documentDigestReportSchema = documentChunkSchema.pick({
  kind: true,
  title: true,
  subject: true,
  date: true,
  scope: true,
  unitKey: true,
  chunk: true,
});
export type DocumentDigestReportDto = z.infer<typeof documentDigestReportSchema>;
