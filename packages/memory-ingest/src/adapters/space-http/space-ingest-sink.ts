import {
  MemoryHostRefused,
  MemoryHostTimeout,
  MemoryHostUnreachable,
  SpaceNotCompiled,
  type MemoryClient,
} from '@sysdesign/agentic-memory-client';
import { errorMessage, type DigestDto, type RecordScope } from '@sysdesign/contracts';

import {
  SinkFault,
  type IngestSink,
  type ManifestEntry,
  type PlannedChunk,
  type PostingOutcome,
} from '../../core/ports';
import { endorsesMemories, outcomeOf } from './digest-outcome';
import { digestRequestOf } from './digest-request';
import type { IngestSpace } from './ingest-space';

/** Why a record is closed when the posting that wrote it is retracted: kept on the record, read back by `history`. */
export const RETRACTION_REASON = 'retracted by memory-ingest';

/** How a posting's wait is paced. */
interface DigestWaiting {
  /** How long between two reads of a digest still running. */
  pollEveryMs: number;
  /** The pause itself; a spec passes one that does not wait. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A refusal by its status and the host's own words, each offending field named. */
const refusalMessage = (error: MemoryHostRefused): string => {
  const issues = error.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
  return `${error.status}: ${error.message}${issues === '' ? '' : ` (${issues})`}`;
};

/** The memory client's failures as the port's; anything else as it is. */
const hostFault = (error: unknown): unknown => {
  if (error instanceof MemoryHostRefused) return new SinkFault('refused', refusalMessage(error));
  if (error instanceof SpaceNotCompiled) return new SinkFault('refused', error.message);
  if (error instanceof MemoryHostUnreachable) return new SinkFault('unreachable', error.message);
  if (error instanceof MemoryHostTimeout) return new SinkFault('timeout', error.message);
  return error;
};

/**
 * A memory space over the memory client: hand the chunk in as one digest
 * under the tenant's partition, read the digest back until the loop settles
 * it, apply once what its step endorsed, and record the records the apply
 * answered. A digest has no heartbeat of its own to judge liveness by; the
 * loop's own janitor fails a run whose beat has stopped, so a wait ends when
 * the loop settles the digest, however it settles. A start the host refuses is
 * the port's refusal; anything that fails after the start is an unfinished
 * posting, so the caller still has the run's id to record — and
 * `status --refresh` reads the digest back, its apply included, once the host
 * answers again. What a posting stored is taken out record by record, under
 * the scope the posting wrote under.
 */
export class SpaceIngestSink implements IngestSink {
  readonly kind = 'space' as const;
  readonly host: string;
  readonly spaceId: string;
  readonly scope: RecordScope;

  constructor(
    private readonly client: MemoryClient,
    private readonly space: IngestSpace,
    private readonly waiting: DigestWaiting,
  ) {
    this.host = space.host;
    this.spaceId = space.spaceId;
    this.scope = space.scope;
  }

  async post(planned: PlannedChunk): Promise<PostingOutcome> {
    let orchestrationRunId: string;
    try {
      const started = await this.client.startDigest(
        this.spaceId,
        digestRequestOf(planned, this.space),
      );
      orchestrationRunId = started.orchestrationRunId;
    } catch (error) {
      throw hostFault(error);
    }
    try {
      const digest = await this.awaitDigest(orchestrationRunId);
      return outcomeOf(endorsesMemories(digest) ? await this.apply(digest) : digest);
    } catch (error) {
      throw new SinkFault('unfinished', errorMessage(error), orchestrationRunId);
    }
  }

  async status(entry: ManifestEntry): Promise<PostingOutcome | null> {
    if (entry.orchestrationRunId === null) return null;
    try {
      const digest = await this.client.getDigest(
        entry.spaceId ?? this.spaceId,
        entry.orchestrationRunId,
      );
      return digest === null ? null : outcomeOf(digest);
    } catch (error) {
      throw hostFault(error);
    }
  }

  /**
   * Each recorded record closed with the retraction's reason, under the scope
   * the posting wrote under; one another standing posting lists too is kept,
   * since that posting still stands on it; one closed already — superseded,
   * or retracted by an earlier attempt — stands as closed and counts for
   * nothing. Every refusal is collected, never the first stopping the rest,
   * and the batch is refused as a whole when any was, so the posting stays
   * unmarked and a later retraction asks again for what is left.
   */
  async retract(entry: ManifestEntry, keep: ReadonlySet<string>): Promise<number> {
    const spaceId = entry.spaceId ?? this.spaceId;
    let removed = 0;
    const refusals: string[] = [];
    for (const recordId of entry.recordIds) {
      if (keep.has(recordId)) continue;
      try {
        await this.client.invalidate(spaceId, {
          recordId,
          scope: entry.scope ?? this.scope,
          reason: RETRACTION_REASON,
        });
        removed += 1;
      } catch (error) {
        if (!(error instanceof MemoryHostRefused)) throw hostFault(error);
        if (error.code !== 'record.not_current') refusals.push(`${recordId}: ${error.message}`);
      }
    }
    if (refusals.length > 0) {
      throw new SinkFault(
        'refused',
        `${refusals.length} of ${entry.recordIds.length} records were not closed: ${refusals.join('; ')}`,
      );
    }
    return removed;
  }

  /** The digest once the loop has settled it; a digest the host no longer has ends the wait. */
  private async awaitDigest(orchestrationRunId: string): Promise<DigestDto> {
    const sleep = this.waiting.sleep ?? defaultSleep;
    for (;;) {
      const digest = await this.client.getDigest(this.spaceId, orchestrationRunId);
      if (digest === null) {
        throw new Error(`the memory host no longer has digest ${orchestrationRunId}`);
      }
      if (digest.status !== 'running') return digest;
      await sleep(this.waiting.pollEveryMs);
    }
  }

  /**
   * The endorsed memories remembered once, and the digest with its apply. A
   * digest the host says is applied already — by an earlier attempt whose
   * answer was lost — is read back, and the host's record of that apply is the
   * answer.
   */
  private async apply(digest: DigestDto): Promise<DigestDto> {
    try {
      const applied = await this.client.applyDigest(this.spaceId, digest.orchestrationRunId);
      return { ...digest, applied };
    } catch (error) {
      if (error instanceof MemoryHostRefused && error.code === 'digest.applied') {
        const read = await this.client.getDigest(this.spaceId, digest.orchestrationRunId);
        if (read?.applied) return read;
      }
      throw error;
    }
  }
}
