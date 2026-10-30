/**
 * The memory client a consumer's specs run on: the same port, over the real
 * runtime — `MemoryService` on the runtime's in-memory stores — with no host up
 * and nothing scripted. Each request goes through the contracts schema the
 * host's door parses it with, so a default, a bound and a refinement apply as
 * they do over the wire, and the runtime's refusals come back as the port's own
 * errors at the status the contracts declare for each code. A consumer's spec
 * therefore proves identity, supersession, scope visibility and refusals
 * against the engine. Pure — no vitest import.
 *
 * What a host adds beyond the runtime is not here. A digest is a loop run, so
 * every digest method rejects. A space is made from a strategy the spec declares
 * by run id, and a run it did not declare is the host's `run.not_found`; the
 * loop's other readings of a run (`run.in_flight`, `run.no_strategy`) need a
 * loop. A declared strategy that does not read is the runtime's own
 * `strategy.unreadable`, raised as `SpaceNotCompiled` like any compile problem.
 */
import { randomUUID } from 'node:crypto';

import {
  MemoryRefused,
  MemoryService,
  type Embedder,
  type MemoryPolicy,
} from '@sysdesign/agentic-memory';
import {
  InMemoryRecordStore,
  InMemorySpaceStore,
  InMemoryVectorIndex,
  tableEmbedder,
  TEST_POLICY,
} from '@sysdesign/agentic-memory/testing';
import {
  consolidateRequestSchema,
  createSpaceRequestSchema,
  invalidateRecordRequestSchema,
  recallRecordsRequestSchema,
  recordHistoryRequestSchema,
  rememberRequestSchema,
  SPACE_REFUSAL_MISSING,
  SPACE_REFUSAL_STATUS,
  spaceNameSchema,
  updateRecordRequestSchema,
  type ApiValidationIssue,
  type ConsolidationResultDto,
  type EnsuredSpaceDto,
  type MemoryRecordDto,
  type MemorySpaceDto,
  type RecallResultDto,
  type SpaceRefusal,
  type WriteResultDto,
} from '@sysdesign/contracts';
import { z } from 'zod';

import {
  MemoryClient,
  routeOf,
  ROUTES,
  type ConsolidateRequest,
  type DigestRequest,
  type HistoryRequest,
  type InvalidateRequest,
  type RecallRequest,
  type RememberRequest,
  type UpdateRequest,
} from './memory-client';
import { MemoryHostRefused, SpaceNotCompiled } from './memory-errors';

/**
 * The golden strategy a consumer's spec can make a space from, offered here so a
 * consumer never depends on the engine package for its fixtures.
 */
export { GOLDEN_STRATEGY } from '@sysdesign/agentic-memory/testing';

/**
 * The runtime's test policy under four scope keys — a partition, a project, a
 * user and a unit of work — so a consumer's spec can prove visibility across
 * every key an agent's binding may name. The runtime's own policy declares two
 * (`TEST_POLICY`); the numbers are its.
 */
const FOUR_KEY_POLICY: MemoryPolicy = {
  ...TEST_POLICY,
  scopeKeys: ['tenant', 'project', 'user', 'unit'],
};

/** Where a space made here says its policy came from. */
const POLICY_SOURCE = 'in-process';

/** The one instant the runtime reads as now, unless a spec hands in a clock. */
const FIXED_NOW = new Date('2026-10-01T00:00:00.000Z');

/** A digest is a loop run: each digest verb rejects, as the port's promise would, and never throws at the call. */
const noDigests = (): Promise<never> =>
  Promise.reject(
    new Error(
      'the in-process memory client runs no digests: a digest is a loop run; spec that seam against HttpMemoryClient with a scripted fetch',
    ),
  );

/** A space's id as the door reads the path parameter (`ParseUUIDPipe`). */
const spaceIdSchema = z.uuid();

/** The contract's dotted path of a fault (`scope.unit`), as the door's pipe writes it. */
const dotted = (at: readonly PropertyKey[]): string => at.map(String).join('.');

/**
 * A value through the schema the host's door parses it with. One the schema
 * refuses is the pipe's 400 — no code, every offending path named — so a
 * malformed request fails here exactly as it would over the wire, and never
 * reaches the runtime.
 */
function atDoor<S extends z.ZodType>(route: string, schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issues: ApiValidationIssue[] = parsed.error.issues.map((issue) => ({
    path: dotted(issue.path),
    message: issue.message,
  }));
  throw new MemoryHostRefused({
    status: 400,
    route,
    code: null,
    message: 'validation failed',
    issues,
  });
}

/** The refusals the contracts declare 404, each naming what is missing. */
type NotFound = keyof typeof SPACE_REFUSAL_MISSING;

const isNotFound = (code: SpaceRefusal): code is NotFound => code in SPACE_REFUSAL_MISSING;

/** A refusal by its code, at the one status the contracts declare for it, naming what a 404 did not find. */
const refusal = (
  route: string,
  code: SpaceRefusal,
  message: string,
  issues: ApiValidationIssue[] = [],
): MemoryHostRefused =>
  new MemoryHostRefused({
    status: SPACE_REFUSAL_STATUS[code],
    route,
    code,
    message,
    issues,
    missing: isNotFound(code) ? SPACE_REFUSAL_MISSING[code] : null,
  });

/** The runtime's refusal as the host answers it; anything else goes on as the error it is. */
const asHostRefusal = (route: string, error: unknown): unknown =>
  error instanceof MemoryRefused ? refusal(route, error.code, error.message, error.issues) : error;

export class InProcessMemoryClient extends MemoryClient {
  constructor(
    private readonly memory: MemoryService,
    private readonly policy: MemoryPolicy,
    /** The runs a spec declared, by id: each the strategy a space ensured from it is made of. */
    private readonly strategies: Readonly<Record<string, unknown>>,
  ) {
    super();
  }

  getSpace(spaceId: string): Promise<MemorySpaceDto | null> {
    const route = routeOf(ROUTES.getSpace);
    return this.read(route, () => this.memory.getSpace(atDoor(route, spaceIdSchema, spaceId)));
  }

  getSpaceByName(name: string): Promise<MemorySpaceDto | null> {
    const route = routeOf(ROUTES.getSpaceByName);
    return this.read(route, () => this.memory.getSpaceByName(atDoor(route, spaceNameSchema, name)));
  }

  async ensureSpace(
    name: string,
    request: z.input<typeof createSpaceRequestSchema>,
  ): Promise<EnsuredSpaceDto> {
    const route = routeOf(ROUTES.ensureSpace);
    const ensured = await this.answered(route, () => {
      const { runId } = atDoor(route, createSpaceRequestSchema, request);
      return this.memory.ensureSpace({
        name: atDoor(route, spaceNameSchema, name),
        designRunId: runId,
        policy: this.policy,
        policySource: POLICY_SOURCE,
        strategy: () => this.strategyOf(runId),
      });
    });
    if ('report' in ensured) throw new SpaceNotCompiled(ensured.report);
    return ensured;
  }

  remember(spaceId: string, request: RememberRequest): Promise<WriteResultDto> {
    return this.verb(
      routeOf(ROUTES.remember),
      spaceId,
      rememberRequestSchema,
      request,
      (id, body) => this.memory.remember(id, body),
    );
  }

  update(spaceId: string, request: UpdateRequest): Promise<WriteResultDto> {
    return this.verb(
      routeOf(ROUTES.update),
      spaceId,
      updateRecordRequestSchema,
      request,
      (id, body) => this.memory.update(id, body),
    );
  }

  invalidate(spaceId: string, request: InvalidateRequest): Promise<MemoryRecordDto> {
    return this.verb(
      routeOf(ROUTES.invalidate),
      spaceId,
      invalidateRecordRequestSchema,
      request,
      (id, body) => this.memory.invalidate(id, body),
    );
  }

  recall(spaceId: string, request: RecallRequest): Promise<RecallResultDto> {
    return this.verb(
      routeOf(ROUTES.recall),
      spaceId,
      recallRecordsRequestSchema,
      request,
      (id, body) => this.memory.recall(id, body),
    );
  }

  history(spaceId: string, request: HistoryRequest): Promise<MemoryRecordDto[]> {
    return this.verb(
      routeOf(ROUTES.history),
      spaceId,
      recordHistoryRequestSchema,
      request,
      (id, body) => this.memory.history(id, body),
    );
  }

  consolidate(spaceId: string, request: ConsolidateRequest): Promise<ConsolidationResultDto> {
    return this.verb(
      routeOf(ROUTES.consolidate),
      spaceId,
      consolidateRequestSchema,
      request,
      (id, body) => this.memory.consolidate(id, body),
    );
  }

  startDigest(_spaceId: string, _request: DigestRequest): Promise<never> {
    return noDigests();
  }

  getDigest(_spaceId: string, _orchestrationRunId: string): Promise<never> {
    return noDigests();
  }

  applyDigest(_spaceId: string, _orchestrationRunId: string): Promise<never> {
    return noDigests();
  }

  /**
   * The run's strategy as the spec declared it, read only where a space is to
   * be made — a name the run already holds is answered without it, as the host
   * answers one without reading the loop; a run the spec did not declare is the
   * host's `run.not_found`.
   */
  private strategyOf(runId: string): Promise<unknown> {
    return Object.hasOwn(this.strategies, runId)
      ? Promise.resolve(this.strategies[runId])
      : Promise.reject(
          refusal(
            routeOf(ROUTES.ensureSpace),
            'run.not_found',
            `no run ${runId} is declared to the in-process memory client`,
          ),
        );
  }

  /** A scoped verb: the id and the body through the door, then the runtime; its refusal is the host's. */
  private verb<S extends z.ZodType, T>(
    route: string,
    spaceId: string,
    schema: S,
    request: z.input<S>,
    call: (spaceId: string, body: z.output<S>) => Promise<T>,
  ): Promise<T> {
    return this.answered(route, () =>
      call(atDoor(route, spaceIdSchema, spaceId), atDoor(route, schema, request)),
    );
  }

  /** A call with its refusals answered as the host's. */
  private async answered<T>(route: string, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      throw asHostRefusal(route, error);
    }
  }

  /** An unscoped read: null for what the runtime does not have — a refusal the contracts declare 404, the not-found the HTTP adapter reads as null; every other refusal the host's. */
  private async read<T>(route: string, call: () => Promise<T>): Promise<T | null> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof MemoryRefused && isNotFound(error.code)) return null;
      throw asHostRefusal(route, error);
    }
  }
}

/**
 * A client over a fresh runtime for one spec: the in-memory stores it writes
 * to, handed back so the spec can inspect rows and points; the four-key policy
 * unless the spec names another; a table-driven embedder unless it hands one
 * in; one fixed instant unless it hands in a clock; and the runs it declares,
 * each the strategy a space ensured from it is made of.
 */
export function memoryClientUnderTest(
  options: {
    strategies?: Readonly<Record<string, unknown>>;
    policy?: MemoryPolicy;
    embedder?: Embedder;
    now?: () => Date;
  } = {},
) {
  const records = new InMemoryRecordStore();
  const spaces = new InMemorySpaceStore();
  const embedder = options.embedder ?? tableEmbedder({ model: 'spec-embedder', dimensions: 4 });
  const index = new InMemoryVectorIndex(embedder.model === null ? null : `spec__${embedder.model}`);
  const memory = new MemoryService({
    records,
    spaces,
    index,
    embedder,
    clock: options.now ?? (() => new Date(FIXED_NOW)),
    ids: randomUUID,
    warn: () => undefined,
  });
  const client = new InProcessMemoryClient(
    memory,
    options.policy ?? FOUR_KEY_POLICY,
    options.strategies ?? {},
  );
  return { client, records, index, spaces };
}
