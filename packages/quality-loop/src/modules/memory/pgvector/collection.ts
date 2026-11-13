/**
 * How chunks live in the stack's database: one table per index generation,
 * embedding model and width; one row per memory carrying a vector column for
 * each way it is indexed and its payload as jsonb; a row id that is a pure
 * function of (source run, ref); and a payload that round-trips through the
 * memory-recall pipeline's own `chunkSourceSchema`. The schema the table and
 * its indexes are made sure of by at boot is declared here as statements.
 */
import { createHash } from 'node:crypto';

import {
  KNOWLEDGE_GROUNDINGS,
  KNOWLEDGE_POLARITIES,
  MEMORY_SCOPES,
  SEVERITIES,
  TRANSITION_KINDS,
  unitKeySchema,
  type MemoryLineageDto,
} from '@sysdesign/contracts';
import { collectionName as vectorCollection } from '@sysdesign/pgvector-kit';
import { z } from 'zod';

import {
  EVIDENCE_KINDS,
  VECTOR_NAMES,
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
 * v1 embedded the whole lesson into a single unnamed vector. The move from
 * Qdrant to pgvector (2026-11-12) kept v2: the vectors did not change, only
 * where they are kept, so the collection was carried over point by point
 * (`main.js import-qdrant`) under the ids it already had.
 */
const INDEX_GENERATION = 'v2';

/** Bound to the generation, the model and the width, so nothing ever mixes. */
export const collectionName = (model: string, dimensions: number): string =>
  vectorCollection('quality-memory', INDEX_GENERATION, model, dimensions);

/**
 * The payload fields a filter narrows by, each given an expression index on
 * `payload->>'<field>'`: `runId` is what a replace, a retraction and a
 * support write select by (the latter with `ref`, which the run index narrows
 * first); `kind` and `pipeline` are a probe's declared narrowing; a document
 * memory's `scope` and the `unitKey` of one bound to a unit of work are what
 * every search leaves other units' memories out by. Nothing else is indexed:
 * the facets and the lineage paths had keyword indexes in Qdrant that no
 * probe ever filtered by (the coach recall reads `lineage` off the hits after
 * fusion), so the pgvector move did not recreate them. Indexes are ensured on
 * every boot, not only with the table, so a field added here reaches a table
 * that already holds the corpus without a generation bump.
 */
export const INDEXED_FIELDS = ['runId', 'kind', 'pipeline', 'scope', 'unitKey'] as const;

/** A UUID-shaped digest of (source run, ref): the same memory always lands on the same point. */
export function pointId(sourceRunId: string, ref: string): string {
  const hex = createHash('sha256').update(`${sourceRunId}|${ref}`, 'utf8').digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** PostgreSQL cuts an identifier past NAMEDATALEN - 1 bytes without a word. */
const IDENTIFIER_BYTES = 63;
const DIGEST_CHARACTERS = 12;
/** What a table's identifier may hold, as the kit derives it — the one shape this module interpolates. */
const TABLE_SHAPE = /^[a-z0-9_]+$/;

/**
 * The stem every index of a table is named from, `<stem>_<suffix>`, with room
 * for the longest suffix: the table name itself when that fits the identifier
 * limit, else its first characters and twelve hex of its sha256, so a long
 * table's indexes stay distinct from another long table's and are never cut
 * by the server without a word.
 */
function indexStem(table: string, longestSuffix: number): string {
  const room = IDENTIFIER_BYTES - longestSuffix - 1;
  if (table.length <= room) return table;
  const digest = createHash('sha256').update(table, 'utf8').digest('hex');
  return `${table.slice(0, room - DIGEST_CHARACTERS - 1)}_${digest.slice(0, DIGEST_CHARACTERS)}`;
}

/**
 * The statements that make sure of a collection's table, in order: the table
 * (`id` the point id, `payload` the chunk, one `vector(<width>)` column per
 * named vector), one expression btree index per filtered field, and an HNSW
 * cosine index per vector column. Every statement is `if not exists`, so a
 * boot over a table that already holds the corpus adds what is new and
 * touches nothing else. The table name is the kit's `tableName` and the
 * width the embedding client's: both are checked for the one shape this
 * interpolates, so no caller's value reaches the statement text unread.
 */
export function schemaFor(table: string, dimensions: number): string[] {
  if (!TABLE_SHAPE.test(table)) {
    throw new Error(`a memory table is named in [a-z0-9_] only, not "${table}"`);
  }
  if (!Number.isInteger(dimensions) || dimensions < 1) {
    throw new Error(`a vector column takes a positive whole width, not ${String(dimensions)}`);
  }
  const fieldIndexes = INDEXED_FIELDS.map((field) => ({ suffix: `${field}_idx`, field }));
  const vectorIndexes = VECTOR_NAMES.map((name) => ({ suffix: `${name}_hnsw`, name }));
  const longest = Math.max(
    ...[...fieldIndexes, ...vectorIndexes].map((index) => index.suffix.length),
  );
  const stem = indexStem(table, longest);
  const quoted = `"${table}"`;
  const columns = VECTOR_NAMES.map((name) => `"${name}" vector(${dimensions}) not null`);
  return [
    `create table if not exists ${quoted} (id uuid primary key, payload jsonb not null, ${columns.join(', ')})`,
    ...fieldIndexes.map(
      ({ suffix, field }) =>
        `create index if not exists "${stem}_${suffix}" on ${quoted} ((payload->>'${field}'))`,
    ),
    ...vectorIndexes.map(
      ({ suffix, name }) =>
        `create index if not exists "${stem}_${suffix}" on ${quoted} using hnsw ("${name}" vector_cosine_ops)`,
    ),
  ];
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
 * The facets, flat so a filter can read them by key and every one optional so
 * the points written before they existed still parse — a strict schema would
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

/** What a stored row's payload holds — the one shape this module writes and reads, and an import admits. */
export const payloadSchema = chunkSourceSchema.extend({
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
