import { MemoryClient, type DigestRequest } from '@sysdesign/agentic-memory-client';
import type {
  AppliedDigestDto,
  DigestDto,
  DigestItemDto,
  MemorySpaceDto,
  OrchestrationRunStartedDto,
} from '@sysdesign/contracts';

import { FIXED_NOW, SPACE_ID } from './fakes';

/**
 * The memory host's digest seam, scripted: a digest is a loop run, which the
 * in-process client cannot run, so the shipping space sink is exercised here
 * against answers a spec writes down — what each start answers, what each read
 * of the digest shows as the loop works through it, and what the apply does.
 * Every other verb is the in-process client's to prove against the engine; a
 * spec that reaches one here has reached the wrong fake. Test code only.
 */

/** How one digest goes: the run its start answers, each read in order (the last standing for every read after), and what applying it does. */
interface DigestScript {
  orchestrationRunId: string;
  /** Each read's answer, in order; `null` is a digest the host no longer has. The last answer repeats. */
  reads: (DigestDto | null)[];
  /** What the apply answers, or throws; a script with none fails the apply as unscripted. */
  apply?: AppliedDigestDto | Error;
}

const unscripted = (verb: string): Promise<never> =>
  Promise.reject(new Error(`${verb} is not scripted: prove it against the in-process client`));

export class ScriptedMemoryClient extends MemoryClient {
  /** Each start, in order: the space and the request as the sink composed it. */
  readonly started: { spaceId: string; request: DigestRequest }[] = [];
  /** Each read, in order, by run id. */
  readonly reads: string[] = [];
  /** Each apply, in order, by run id. */
  readonly applied: string[] = [];
  /** What the next start throws instead of starting; cleared once thrown. */
  refuseNextStart: Error | null = null;
  /** Spaces by name, as `getSpaceByName` answers them. */
  readonly spaces = new Map<string, MemorySpaceDto>();
  private readonly pending: DigestScript[] = [];
  private readonly scripts = new Map<string, DigestScript>();

  /** The next start follows this script. */
  script(digest: DigestScript): void {
    this.pending.push(digest);
    this.scripts.set(digest.orchestrationRunId, digest);
  }

  getSpace(spaceId: string): Promise<MemorySpaceDto | null> {
    return Promise.resolve([...this.spaces.values()].find((space) => space.id === spaceId) ?? null);
  }

  getSpaceByName(name: string): Promise<MemorySpaceDto | null> {
    return Promise.resolve(this.spaces.get(name) ?? null);
  }

  ensureSpace(): Promise<never> {
    return unscripted('ensureSpace');
  }

  remember(): Promise<never> {
    return unscripted('remember');
  }

  update(): Promise<never> {
    return unscripted('update');
  }

  invalidate(): Promise<never> {
    return unscripted('invalidate');
  }

  recall(): Promise<never> {
    return unscripted('recall');
  }

  history(): Promise<never> {
    return unscripted('history');
  }

  consolidate(): Promise<never> {
    return unscripted('consolidate');
  }

  startDigest(spaceId: string, request: DigestRequest): Promise<OrchestrationRunStartedDto> {
    if (this.refuseNextStart !== null) {
      const error = this.refuseNextStart;
      this.refuseNextStart = null;
      return Promise.reject(error);
    }
    this.started.push({ spaceId, request });
    const next = this.pending.shift();
    if (next === undefined)
      return Promise.reject(new Error('no digest is scripted for this start'));
    return Promise.resolve({ orchestrationRunId: next.orchestrationRunId, status: 'running' });
  }

  getDigest(_spaceId: string, orchestrationRunId: string): Promise<DigestDto | null> {
    this.reads.push(orchestrationRunId);
    const script = this.scripts.get(orchestrationRunId);
    if (script === undefined) return Promise.resolve(null);
    const answer = script.reads.length > 1 ? script.reads.shift() : script.reads[0];
    return Promise.resolve(answer ?? null);
  }

  applyDigest(_spaceId: string, orchestrationRunId: string): Promise<AppliedDigestDto> {
    this.applied.push(orchestrationRunId);
    const apply = this.scripts.get(orchestrationRunId)?.apply;
    if (apply === undefined) return unscripted(`applyDigest(${orchestrationRunId})`);
    return apply instanceof Error ? Promise.reject(apply) : Promise.resolve(apply);
  }
}

export const DIGEST_RUN = '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f';
export const REGISTER_DIGEST_RUN = '9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';

/** One memory the digest proposed and endorsed, by its ref. */
const proposed = (ref: string) => ({
  ref,
  register: 'facts',
  kind: 'semantic' as const,
  evidence: ['section.1'],
  candidate: { subject: 'Ada', predicate: ref, value: `the value of ${ref}`, validFrom: null },
});

/** A digest the loop settled complete, its step endorsing two memories, not yet applied — unless the overrides say otherwise. */
export const digestDto = (overrides: Partial<DigestDto> = {}): DigestDto => ({
  orchestrationRunId: DIGEST_RUN,
  status: 'complete',
  step: {
    status: 'complete',
    reason: null,
    note: null,
    counts: { memories: 2, endorsed: 2, withheld: 0 },
  },
  digestRunId: REGISTER_DIGEST_RUN,
  report: {
    admission: 'admitted',
    memories: [proposed('m1'), proposed('m2')],
    endorsed: ['m1', 'm2'],
    withheld: [],
  },
  applied: null,
  ...overrides,
});

/** A digest still running, as the first reads of one show it. */
export const runningDigest = (): DigestDto =>
  digestDto({
    status: 'running',
    step: { status: 'running', reason: null, note: null, counts: {} },
    report: null,
  });

export const RECORD_IDS = [
  '3b4c5d6e-7f80-4a1b-9c2d-3e4f5a6b7c8d',
  '4c5d6e7f-8091-4b2c-8d3e-4f5a6b7c8d9e',
] as const;

/** An endorsed memory remembered: what the write did and the record it left current. */
export const writtenItem = (ref: string, recordId: string): DigestItemDto => ({
  ref,
  outcome: 'inserted',
  recordId,
  refusal: null,
});

/** An endorsed memory the runtime refused. */
export const refusedItem = (ref: string): DigestItemDto => ({
  ref,
  outcome: null,
  recordId: null,
  refusal: { code: 'candidate.invalid', message: 'value: too long', issues: [] },
});

/** A digest applied: both endorsed memories written, unless the items say otherwise. */
export const appliedDto = (
  items: DigestItemDto[] = [writtenItem('m1', RECORD_IDS[0]), writtenItem('m2', RECORD_IDS[1])],
): AppliedDigestDto => ({
  orchestrationRunId: DIGEST_RUN,
  spaceId: SPACE_ID,
  digestRunId: REGISTER_DIGEST_RUN,
  items,
  appliedAt: FIXED_NOW,
});
