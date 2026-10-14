/**
 * The document-memory orchestrator's own wire types: it digests one document
 * chunk into facts about its subject and stores what the digest endorsed. The
 * run itself is an `OrchestrationRunDto`; its context is a `MemoryContextDto`.
 */
import type { z } from 'zod';

import { documentChunkSchema } from './document-digest';

export const DOCUMENT_MEMORY_ORCHESTRATOR_ID = 'document-memory';

/**
 * Why a document-memory step skipped, failed, or completed without effect —
 * beyond the runner's own reasons. A digest that was judged and fell short is
 * `not-accepted`; one that was never judged says why instead.
 */
export const DOCUMENT_MEMORY_STEP_REASONS = [
  'embeddings-disabled',
  'store-unavailable',
  'embedding-failed',
  'not-accepted',
  'no-rubric',
  'no-artifact',
  'no-memories',
] as const;
export type DocumentMemoryStepReason = (typeof DOCUMENT_MEMORY_STEP_REASONS)[number];

/**
 * What the digest step reports: the document it digested, read from the
 * goal's own index — with the scope it declared, when it declared one.
 */
export const documentDigestReportSchema = documentChunkSchema.pick({
  kind: true,
  title: true,
  subject: true,
  date: true,
  scope: true,
  chunk: true,
});
export type DocumentDigestReportDto = z.infer<typeof documentDigestReportSchema>;
