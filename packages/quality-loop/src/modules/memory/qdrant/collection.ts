/**
 * How chunks live in Qdrant: one collection per embedding model and width,
 * a point id that is a pure function of (source run, ref), and a payload that
 * round-trips through the memory-recall pipeline's own `chunkSourceSchema`.
 */
import { createHash } from 'node:crypto';

import { z } from 'zod';

import { EVIDENCE_KINDS } from '../../../pipelines/experience-digest/input';
import { chunkSourceSchema } from '../../../pipelines/memory-recall/input';
import type { MemoryChunk, MemoryHit } from '../ports';

/** Bound to the model and width, so a model change never mixes vectors. */
export const collectionName = (model: string, dimensions: number): string =>
  `quality-memory__${model.replace(/[^A-Za-z0-9_-]/g, '-')}__${dimensions}`;

/** Payload fields a filter may use; each gets a keyword index. */
export const INDEXED_FIELDS = ['runId', 'pipeline', 'kind'] as const;

/** A UUID-shaped digest of (source run, ref): the same memory always lands on the same point. */
export function pointId(sourceRunId: string, ref: string): string {
  const hex = createHash('sha256').update(`${sourceRunId}|${ref}`, 'utf8').digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const payloadSchema = chunkSourceSchema.extend({
  text: z.string().min(1),
  contentHash: z.string().length(64),
  model: z.string().min(1),
  evidence: z.array(z.strictObject({ kind: z.enum(EVIDENCE_KINDS), ref: z.string().min(1) })),
  digestRunId: z.string().nullable(),
  storedAt: z.string(),
});

export type ChunkPayload = z.infer<typeof payloadSchema>;

export function toPayload(chunk: MemoryChunk, storedAt: string): ChunkPayload {
  return {
    ...chunk.source,
    text: chunk.text,
    contentHash: chunk.contentHash,
    model: chunk.model,
    evidence: chunk.evidence,
    digestRunId: chunk.digestRunId,
    storedAt,
  };
}

/** A hit from a stored payload, or null for a point this module did not write. */
export function fromPayload(payload: unknown, score: number): MemoryHit | null {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { text, contentHash, model, evidence, digestRunId, storedAt, ...source } = parsed.data;
  void storedAt;
  return { text, contentHash, model, evidence, digestRunId, source, score };
}
