/**
 * How chunks live in Qdrant: one collection per index generation, embedding
 * model and width; one point per memory carrying a named vector for each way
 * it is indexed; a point id that is a pure function of (source run, ref); and
 * a payload that round-trips through the memory-recall pipeline's own
 * `chunkSourceSchema`.
 */
import { createHash } from 'node:crypto';

import type { Schemas } from '@qdrant/js-client-rest';
import {
  KNOWLEDGE_GROUNDINGS,
  KNOWLEDGE_POLARITIES,
  MEMORY_SCOPES,
  SEVERITIES,
  TRANSITION_KINDS,
  unitKeySchema,
  type MemoryLineageDto,
} from '@sysdesign/contracts';
import { collectionName as qdrantCollection } from '@sysdesign/qdrant-kit';
import { z } from 'zod';

import {
  EVIDENCE_KINDS,
  type ChunkFacets,
  type IndexedChunk,
  type MemoryChunk,
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
  qdrantCollection('quality-memory', INDEX_GENERATION, model, dimensions);

/** The index types Qdrant builds, as its client names them. */
type PayloadIndexSchema = Schemas['PayloadSchemaType'];

/**
 * Payload fields a filter may use, each declaring the index it needs. The
 * facets are here because a search that cannot narrow by them is a search that
 * reads the whole store: measured on the live corpus, a candidate digested from
 * the same pipeline as the query was twice as likely to be kept as one from
 * another. The lineage paths are what a recall screens by — the run that judged
 * a lesson's evidence, the run it adopted, the prompt it was asked. Indexes are
 * ensured on every boot, not only when the collection is created, so a field
 * added here reaches a collection that already exists: the payload grew both
 * without a generation bump, since the vectors did not change, only what rides
 * beside them.
 *
 * The index type is DECLARED per field rather than assumed, because Qdrant
 * accepts a keyword index on a numeric field and then never matches an integer
 * filter against it — which reads as "nothing found" rather than as an error.
 * Every field here is a string or an array of strings today; the declaration is
 * what keeps that from being an assumption the next field inherits. A lineage's
 * `iteration` is not indexed: the novelty screen compares iterations in code
 * after fusion, never in a store filter.
 *
 * A nested field is written as Qdrant addresses it, dotted (`a.b`), under the
 * payload key its first segment names. A document memory's `scope` and
 * the `unitKey` of one bound to a unit of work are what every search leaves
 * other units' memories out by.
 */
export const INDEXED_FIELDS: Readonly<Record<string, PayloadIndexSchema>> = {
  runId: 'keyword',
  pipeline: 'keyword',
  kind: 'keyword',
  scope: 'keyword',
  unitKey: 'keyword',
  dimension: 'keyword',
  polarity: 'keyword',
  transition: 'keyword',
  grounding: 'keyword',
  topics: 'keyword',
  criterionKinds: 'keyword',
  findingTypes: 'keyword',
  'lineage.judged.runId': 'keyword',
  'lineage.adoptedFrom.runId': 'keyword',
  'lineage.goalHash': 'keyword',
};

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

/**
 * The facets, flat so Qdrant can index them and every one optional so the
 * points written before they existed still parse — a strict schema would
 * otherwise make every older point invisible to recall rather than merely
 * unfacetted.
 */
const facetFields = {
  polarity: z.enum(KNOWLEDGE_POLARITIES).optional(),
  dimension: z.string().min(1).nullable().optional(),
  topics: z.array(z.string().min(1)).optional(),
  criterionKinds: z.array(z.string().min(1)).optional(),
  findingTypes: z.array(z.string().min(1)).optional(),
  transition: z.enum(TRANSITION_KINDS).nullable().optional(),
  grounding: z.enum(KNOWLEDGE_GROUNDINGS).optional(),
  severity: z.enum(SEVERITIES).optional(),
  support: z.strictObject({ confirms: z.number().int(), contradicts: z.number().int() }).optional(),
};

const FACET_NAMES = Object.keys(facetFields) as (keyof ChunkFacets)[];

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
  /** Where a document memory holds; absent on a point written before scopes, which a reader defaults. */
  scope: z.enum(MEMORY_SCOPES).optional(),
  /** The unit of work a memory bound to one was recorded for; absent on every other point. */
  unitKey: unitKeySchema.optional(),
  ...facetFields,
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
    ...(chunk.scope === undefined ? {} : { scope: chunk.scope }),
    ...(chunk.unitKey === undefined ? {} : { unitKey: chunk.unitKey }),
    ...(chunk.facets ?? {}),
  };
}

/** The facets a payload carries, or undefined when it carries none — so an older point reads exactly as it did. */
function facetsOf(payload: ChunkPayload): ChunkFacets | undefined {
  const entries = FACET_NAMES.flatMap((name) =>
    payload[name] === undefined ? [] : [[name, payload[name]] as const],
  );
  return entries.length === 0 ? undefined : (Object.fromEntries(entries) as ChunkFacets);
}

/**
 * The memory a stored payload holds, or null for a point this module did not
 * write. A search's score is the search's, not the payload's: a hit adds it.
 */
export function fromPayload(payload: unknown): MemoryChunk | null {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const {
    text,
    contentHash,
    model,
    evidence,
    digestRunId,
    lineage,
    storedAt,
    keys,
    polarity,
    dimension,
    topics,
    criterionKinds,
    findingTypes,
    transition,
    grounding,
    severity,
    support,
    scope,
    unitKey,
    ...source
  } = parsed.data;
  // Neither is a fact about the memory: one is when it was written, the other
  // is what it was indexed by, and a reader judges the lesson, not its key. The
  // facets, the scope and the unit are destructured out of `source` and handed
  // back beside it, so a chunk source stays exactly the recall pipeline's own
  // shape — a key left in it would fail its strict schema.
  void storedAt;
  void keys;
  void polarity;
  void dimension;
  void topics;
  void criterionKinds;
  void findingTypes;
  void transition;
  void grounding;
  void severity;
  void support;
  const facets = facetsOf(parsed.data);
  return {
    text,
    contentHash,
    model,
    evidence,
    digestRunId,
    lineage,
    source,
    ...(facets === undefined ? {} : { facets }),
    ...(scope === undefined ? {} : { scope }),
    ...(unitKey === undefined ? {} : { unitKey }),
  };
}
