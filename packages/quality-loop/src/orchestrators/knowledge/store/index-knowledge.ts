/**
 * Write what a run was found to teach: its items and its findings as points, and
 * its claims about other runs' items as rows.
 *
 * Four writes, in an order chosen so a re-run converges rather than accumulating:
 *
 * 1. the chunks, each carrying the support its own point already has, so a point
 *    rewritten with the same text keeps the count other runs gave it;
 * 2. the points, replacing only the kinds this writer owns under the source run —
 *    the memory orchestrator keeps lessons under the same run id;
 * 3. this run's claims, replacing its earlier ones, so digesting twice counts once;
 * 4. the counts of the points those claims name, recomputed from the rows.
 *
 * The last write is the only one that may fail without losing anything: the
 * points stand and the rows are the truth, so the counts can be recomputed by
 * the next run that touches them. It is reported as its own reason rather than
 * folded into the store's.
 */
import type { QualityRunDto, RunTrace } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import { KNOWLEDGE_ITEM_KINDS } from '@sysdesign/contracts';
import { skipped } from '../../common';
import type { ChunkOrigin } from '../../memory/store/chunks';
import type { ChunkKind, IndexedChunk, PointRef, StoredChunk } from '../../memory/ports';
import { VECTOR_NAMES } from '../../memory/ports';
import type { StepResult } from '../../runner/definition';
import type { KnowledgeToStore } from '../digest/read-knowledge-digest';
import type { KnowledgePorts, SupportRow } from '../ports';
import { supportKey } from '../ports';
import { findingChunks, itemChunks, type DimensionMap } from './chunks';

/** The kinds this writer owns under a source run: its items, and the findings it records. */
export const OWNED_KINDS: readonly ChunkKind[] = [...KNOWLEDGE_ITEM_KINDS, 'finding'];

/** The named vectors of chunk `index` out of one batch that asked every name of every chunk in order. */
const vectorsFor = (
  index: number,
  vectors: readonly (readonly number[])[],
): Record<(typeof VECTOR_NAMES)[number], number[]> =>
  Object.fromEntries(
    VECTOR_NAMES.map((name, offset) => [name, vectors[index * VECTOR_NAMES.length + offset]]),
  ) as Record<(typeof VECTOR_NAMES)[number], number[]>;

/** Every claim this run's items make, with the one that says both dropped and counted. */
export function claimsOf(
  items: readonly KnowledgeToStore[],
  digestRunId: string,
): { rows: SupportRow[]; conflicting: number } {
  const rows: SupportRow[] = [];
  let conflicting = 0;
  for (const item of items) {
    const contradicted = new Set(item.contradicts.map((claim) => supportKey(claim.point)));
    for (const claim of item.confirms) {
      if (contradicted.has(supportKey(claim.point))) {
        conflicting += 1;
        continue;
      }
      rows.push({ ...claim, kind: 'confirms', digestRunId });
    }
    for (const claim of item.contradicts) {
      const confirmed = item.confirms.some(
        (other) => supportKey(other.point) === supportKey(claim.point),
      );
      if (confirmed) continue;
      rows.push({ ...claim, kind: 'contradicts', digestRunId });
    }
  }
  // One claim per run per point: two items of one digest naming the same point
  // agree, so the row is written once.
  const seen = new Set<string>();
  return {
    conflicting,
    rows: rows.filter((row) => {
      const key = `${supportKey(row.point)}|${row.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

export interface Writing {
  source: QualityRunDto;
  trace: RunTrace;
  digestRunId: string;
  items: readonly KnowledgeToStore[];
  dimensions: DimensionMap;
  origin: ChunkOrigin;
  model: string;
  /** Claims the digest made against an alias the recall did not hand over. */
  unresolved: number;
}

export async function indexKnowledge(
  ports: Pick<KnowledgePorts, 'embeddings' | 'store' | 'support'>,
  writing: Writing,
): Promise<StepResult<undefined>> {
  const { source, trace, items, dimensions, origin, model, digestRunId } = writing;
  const storable = items.filter((item) => item.storable);
  const chunks = [
    ...itemChunks(storable, origin, trace, dimensions, digestRunId, model),
    ...findingChunks(trace, origin, dimensions, model),
  ];
  if (chunks.length === 0) return skipped('no-items');

  const withSupport = await carrySupport(ports, chunks);
  const embedded = await ports.embeddings.embed(
    withSupport.flatMap((chunk) => VECTOR_NAMES.map((name) => chunk.keys[name])),
  );
  if (embedded === null) return { status: 'failed', reason: 'embedding-failed', note: null };

  let stored: number;
  try {
    stored = await ports.store.replaceRunChunks(
      source.runId,
      withSupport.map((chunk, index): StoredChunk => ({
        ...chunk,
        vectors: vectorsFor(index, embedded.vectors),
      })),
      { kinds: OWNED_KINDS },
    );
  } catch (error) {
    return { status: 'failed', reason: 'store-unavailable', note: describeError(error).message };
  }

  const { rows, conflicting } = claimsOf(items, digestRunId);
  const counts = {
    items: storable.length,
    findings: chunks.length - storable.length,
    chunks: stored,
    embedded: embedded.misses,
    confirms: rows.filter((row) => row.kind === 'confirms').length,
    contradicts: rows.filter((row) => row.kind === 'contradicts').length,
    conflicting,
    unresolved: writing.unresolved,
  };

  try {
    await ports.support.replace(source.runId, rows);
    await reckon(ports, rows);
  } catch (error) {
    // The points stand and the rows are the truth: a count that did not land is
    // recomputed by the next run that touches the same point.
    return {
      status: 'failed',
      reason: 'support-unavailable',
      note: describeError(error).message,
      counts,
    };
  }
  return { status: 'complete', counts };
}

/** Each chunk with the support its own point already carries, so a rewrite keeps it. */
async function carrySupport(
  ports: Pick<KnowledgePorts, 'support'>,
  chunks: readonly IndexedChunk[],
): Promise<IndexedChunk[]> {
  const points = chunks.map((chunk) => ({
    point: { runId: chunk.source.runId, ref: chunk.source.ref },
    contentHash: chunk.contentHash,
  }));
  const counts = await ports.support.countByPoint(points);
  return chunks.map((chunk, index) => {
    const support = counts.get(supportKey(points[index].point));
    return support === undefined ? chunk : { ...chunk, facets: { ...chunk.facets, support } };
  });
}

/** Recompute the counts of every point these claims name, and write them where a search reads them. */
async function reckon(
  ports: Pick<KnowledgePorts, 'store' | 'support'>,
  rows: readonly SupportRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const byKey = new Map<string, { point: PointRef; contentHash: string }>(
    rows.map((row) => [supportKey(row.point), { point: row.point, contentHash: row.contentHash }]),
  );
  const targets = [...byKey.values()];
  const counts = await ports.support.countByPoint(targets);
  await ports.store.setSupport(
    targets.flatMap((target) => {
      const support = counts.get(supportKey(target.point));
      return support === undefined ? [] : [{ point: target.point, support }];
    }),
  );
}
