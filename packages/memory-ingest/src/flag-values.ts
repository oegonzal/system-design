import {
  GOAL_BUDGET_BYTES,
  invalidateRecordRequestSchema,
  recordScopeSchema,
  type MemoryScope,
  type RecordScope,
} from '@sysdesign/contracts';

import {
  DEFAULT_CHUNK_BYTES,
  DEFAULT_KIND,
  INGEST_ENV,
  INGEST_KINDS,
  INGEST_SCOPES,
  IngestConfigError,
  PARTS_PER_CHUNK_BOUND,
  type IngestKind,
} from './config';
import { MAX_PARTS_PER_CHUNK, PARTS_PER_CHUNK } from './core/chunk';
import type { IngestSinkKind } from './core/ports';

/**
 * Each flag's value as the command reads it — the declared default when the
 * flag is absent, the value within its bound when given, or a refusal naming
 * the flag. The flags themselves, and what each means, are `INGEST_FLAGS` in
 * `config.ts`; the readers a flag shares with an environment variable (the
 * subject, a space, a tenant, a register) live beside the variables there.
 */

/** A chunk budget: a positive integer of bytes no larger than the engine's own goal budget. */
export function chunkBytes(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_CHUNK_BYTES;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) <= 0 || Number(raw) > GOAL_BUDGET_BYTES) {
    throw new IngestConfigError(
      `--chunk-bytes must be a positive integer no larger than ${GOAL_BUDGET_BYTES}, got ${JSON.stringify(raw)}`,
    );
  }
  return Number(raw);
}

/**
 * The day a document speaks for, as the contract spells a day — or a refusal
 * naming the flag. Undated is legitimate and is what a document that says
 * nothing gets; a figure like a span of experience is only absolute against
 * the day it was written, so a corpus that knows its date says so.
 */
export function documentDate(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new IngestConfigError(`--date must be a day as YYYY-MM-DD, got ${JSON.stringify(raw)}`);
  }
  return trimmed;
}

/**
 * How many sections one chunk may carry, or a refusal naming the flag. Lower
 * it when a chunk's sections state more facts than the digest's memory cap
 * allows it to propose — the remainder is dropped silently otherwise.
 */
export function partsPerChunk(raw: string | undefined): number {
  if (raw === undefined) return PARTS_PER_CHUNK;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) <= 0 || Number(raw) > MAX_PARTS_PER_CHUNK) {
    throw new IngestConfigError(
      `--parts-per-chunk must be a positive integer no larger than ${MAX_PARTS_PER_CHUNK}, got ${JSON.stringify(raw)}`,
    );
  }
  return Number(raw);
}

/** The parts per chunk held to the configured store's digest, or a refusal naming the flag and the sink. */
export function partsPerChunkWithin(parts: number, sink: IngestSinkKind): number {
  if (parts > PARTS_PER_CHUNK_BOUND[sink]) {
    throw new IngestConfigError(
      `--parts-per-chunk must be at most ${PARTS_PER_CHUNK_BOUND[sink]} when ${INGEST_ENV.sink.name} is ${sink}, got ${parts}`,
    );
  }
  return parts;
}

/** How many chunks one run may post, or a refusal naming the flag. */
export function postLimit(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) <= 0) {
    throw new IngestConfigError(`--limit must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return Number(raw);
}

/** The scope the documents declare for every memory they state, null when they declare none, or a refusal naming the choices. */
export function documentScope(raw: string | undefined): MemoryScope | null {
  if (raw === undefined) return null;
  if (!(INGEST_SCOPES as readonly string[]).includes(raw)) {
    throw new IngestConfigError(
      `--scope must be one of ${INGEST_SCOPES.join(', ')} — a file names no unit of work — got ${raw}`,
    );
  }
  return raw as MemoryScope;
}

/** A document kind the ingester takes, or a refusal naming the choices. */
export function ingestKind(raw: string | undefined): IngestKind {
  if (raw === undefined) return DEFAULT_KIND;
  if (!INGEST_KINDS.includes(raw as IngestKind)) {
    throw new IngestConfigError(`--kind must be one of ${INGEST_KINDS.join(', ')}, got ${raw}`);
  }
  return raw as IngestKind;
}

/**
 * The scope keys a space command narrows by beyond the tenant's partition, as
 * `key=value` pairs — read through the contract's own shape of a scope, so a
 * key or a value the host would refuse is refused here first, by name; whether
 * the space declares each key is the command's to check against the space.
 */
export function scopeUnder(raw: string | undefined): RecordScope {
  if (raw === undefined) return {};
  const pairs = raw
    .split(',')
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const at = pair.indexOf('=');
      if (at <= 0 || at === pair.length - 1) {
        throw new IngestConfigError(
          `--under takes key=value pairs the space declares, comma-separated, got ${JSON.stringify(pair)}`,
        );
      }
      return [pair.slice(0, at), pair.slice(at + 1)] as const;
    });
  if (new Set(pairs.map(([key]) => key)).size !== pairs.length) {
    throw new IngestConfigError(`--under names a key twice: ${raw}`);
  }
  const parsed = recordScopeSchema.safeParse(Object.fromEntries(pairs));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new IngestConfigError(
      `--under is not a scope the host takes: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
    );
  }
  return parsed.data;
}

/** Why a record is forgotten, within the contract's bound on a reason, or a refusal naming the flag. */
export function forgetReason(raw: string): string {
  const parsed = invalidateRecordRequestSchema.shape.reason.safeParse(raw.trim());
  if (!parsed.success) {
    throw new IngestConfigError(`--reason must say why: ${parsed.error.issues[0]?.message}`);
  }
  return parsed.data;
}
