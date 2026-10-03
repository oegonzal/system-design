/**
 * How chunks live in Qdrant: one collection per index generation, embedding
 * model and width; one point per memory carrying a named vector for each way
 * it is indexed; a point id that is a pure function of (source run, ref); and
 * a payload that round-trips through the memory-recall pipeline's own
 * `chunkSourceSchema`.
 */
import { createHash } from 'node:crypto';

import type { MemoryLineageDto } from '@sysdesign/contracts';
import { z } from 'zod';

import {
  EVIDENCE_KINDS,
  type IndexedChunk,
  type MemoryHit,
  type VectorName,
} from '../../../orchestrators/memory/ports';
import { chunkSourceSchema } from '../../../pipelines/memory-recall/input';

/**
 * What is embedded is part of the vector space, exactly as the model and the
 * width are: cosines across generations are not comparable, and one collection
 * ranking two representations against one query is meaningless. Bump this
 * whenever the indexed text changes, and re-index rather than migrating.
 *
 * v2 — one point per memory carrying `condition` and `lesson` named vectors.
 * v1 embedded the whole lesson into a single unnamed vector.
 */
const INDEX_GENERATION = 'v2';

/** Bound to the generation, the model and the width, so nothing ever mixes. */
export const collectionName = (model: string, dimensions: number): string =>
  `quality-memory__${INDEX_GENERATION}__${model.replace(/[^A-Za-z0-9_-]/g, '-')}__${dimensions}`;

/**
 * Payload fields a filter may use; each gets a keyword index. The lineage
 * fields are what a recall screens by — the run that judged a lesson's
 * evidence, the run it adopted, the prompt it was asked — and are indexed on
 * an existing collection as well as a new one, since the payload grew them
 * without a generation bump: the vectors did not change, only what rides
 * beside them.
 */
export const INDEXED_FIELDS = [
  'runId',
  'pipeline',
  'kind',
  'lineage.judged.runId',
  'lineage.adoptedFrom.runId',
  'lineage.goalHash',
] as const;

/** The indexed fields a collection does not yet have, read from its own payload schema. */
export const missingIndexes = (payloadSchema: Readonly<Record<string, unknown>>): string[] =>
  INDEXED_FIELDS.filter((field) => !(field in payloadSchema));

/** A UUID-shaped digest of (source run, ref): the same memory always lands on the same point. */
export function pointId(sourceRunId: string, ref: string): string {
  const hex = createHash('sha256').update(`${sourceRunId}|${ref}`, 'utf8').digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// `satisfies` is the link to VECTOR_NAMES: adding a name there stops compiling
// here until the payload learns to carry it.
const keysSchema = z.strictObject({
  condition: z.string().min(1),
  lesson: z.string().min(1),
}) satisfies z.ZodType<Record<VectorName, string>>;

/** `contentHash` and a lineage's `goalHash` are sha-256 as hex. */
const SHA256_HEX_LENGTH = 64;

const iterationRefSchema = z.strictObject({
  runId: z.string().min(1),
  iteration: z.number().int().min(1),
});

const lineageSchema = z.strictObject({
  judged: iterationRefSchema,
  adoptedFrom: iterationRefSchema.nullable(),
  goalHash: z.string().length(SHA256_HEX_LENGTH),
}) satisfies z.ZodType<MemoryLineageDto>;

const payloadSchema = chunkSourceSchema.extend({
  text: z.string().min(1),
  /** The texts this point's named vectors are of — the store describes itself. */
  keys: keysSchema,
  contentHash: z.string().length(SHA256_HEX_LENGTH),
  model: z.string().min(1),
  evidence: z.array(z.strictObject({ kind: z.enum(EVIDENCE_KINDS), ref: z.string().min(1) })),
  digestRunId: z.string().nullable(),
  /** Absent on a point written before lineage was recorded: it reads as null until its run is re-indexed. */
  lineage: lineageSchema.nullable().default(null),
  storedAt: z.string(),
});

export type ChunkPayload = z.infer<typeof payloadSchema>;

export function toPayload(chunk: IndexedChunk, storedAt: string): ChunkPayload {
  return {
    ...chunk.source,
    text: chunk.text,
    keys: chunk.keys,
    contentHash: chunk.contentHash,
    model: chunk.model,
    evidence: chunk.evidence,
    digestRunId: chunk.digestRunId,
    lineage: chunk.lineage,
    storedAt,
  };
}

/** A hit from a stored payload, or null for a point this module did not write. */
export function fromPayload(payload: unknown, score: number): MemoryHit | null {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { text, contentHash, model, evidence, digestRunId, lineage, storedAt, keys, ...source } =
    parsed.data;
  // Neither is a fact about the hit: one is when it was written, the other is
  // what it was indexed by, and a reader judges the lesson, not its key.
  void storedAt;
  void keys;
  return { text, contentHash, model, evidence, digestRunId, lineage, source, score };
}
