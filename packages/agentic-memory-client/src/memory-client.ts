import type {
  AppliedDigestDto,
  consolidateRequestSchema,
  ConsolidationResultDto,
  createSpaceRequestSchema,
  DigestDto,
  EnsuredSpaceDto,
  invalidateRecordRequestSchema,
  MemoryRecordDto,
  MemorySpaceDto,
  OrchestrationRunStartedDto,
  recallRecordsRequestSchema,
  RecallResultDto,
  recordHistoryRequestSchema,
  registerDigestRequestSchema,
  rememberRequestSchema,
  updateRecordRequestSchema,
  WriteResultDto,
} from '@sysdesign/contracts';
import type { z } from 'zod';

/**
 * Each request as a caller writes it: the input side of the contracts schema
 * the host's door parses it with, so a field the schema defaults — metadata,
 * the registers a recall narrows to, a key or a text left out — may be left
 * out here too. The host, or the in-process adapter, applies the defaults.
 */
export type RememberRequest = z.input<typeof rememberRequestSchema>;
export type UpdateRequest = z.input<typeof updateRecordRequestSchema>;
export type InvalidateRequest = z.input<typeof invalidateRecordRequestSchema>;
export type RecallRequest = z.input<typeof recallRecordsRequestSchema>;
export type HistoryRequest = z.input<typeof recordHistoryRequestSchema>;
export type ConsolidateRequest = z.input<typeof consolidateRequestSchema>;
export type DigestRequest = z.input<typeof registerDigestRequestSchema>;

/**
 * The one port onto the memory host, for every agent that keeps memories in a
 * space: a browser session, a document ingester, whatever comes next.
 * Abstract class rather than an interface so it doubles as a Nest injection
 * token where a consumer uses Nest, and costs nothing where one does not.
 *
 * Its rules, which every adapter keeps:
 *
 * - An unscoped read of something the host does not have answers `null`:
 *   `getSpace`, `getSpaceByName` and `getDigest` address a thing by its id or
 *   name alone, and the caller decides what a missing one means.
 * - Every scoped verb throws. A remember, update, invalidate, recall, history
 *   or consolidate names a scope, and a record that scope does not see is the
 *   host's refusal (`record.not_found`), never `null`: within a scope, "not
 *   found" is an answer the caller must hear. An ensure, a digest started or
 *   applied, and every refusal of a read other than its absence throw too.
 * - Failures are the transport-agnostic errors in `memory-errors.ts`, raised
 *   from a socket and a status by the HTTP adapter and from the runtime's own
 *   refusals by the in-process one, so a consumer handles either the same way.
 * - Nothing here knows what the memories are about. Registers, scope keys and
 *   candidates are the caller's words, checked by the space's declarations at
 *   the host; this port carries them and reads none.
 */
export abstract class MemoryClient {
  /** `GET /spaces/:id` — the space with its compile report and scope keys; null when the host has no such space. */
  abstract getSpace(spaceId: string): Promise<MemorySpaceDto | null>;
  /** `GET /spaces/by-name/:name` — the space ensured under this name; null when none holds it. */
  abstract getSpaceByName(name: string): Promise<MemorySpaceDto | null>;
  /**
   * `PUT /spaces/by-name/:name` — the space under this name, made from the
   * run when none holds the name, the same space when that run made it, and
   * whether this call made it. A name another run holds is refused
   * (`space.name_taken`); a strategy that does not compile is
   * `SpaceNotCompiled` with its report.
   */
  abstract ensureSpace(
    name: string,
    request: z.input<typeof createSpaceRequestSchema>,
  ): Promise<EnsuredSpaceDto>;
  /** `POST /spaces/:id/remember` — what the write did and the record it left current. */
  abstract remember(spaceId: string, request: RememberRequest): Promise<WriteResultDto>;
  /** `POST /spaces/:id/update` — the addressed, current record superseded; what the write did. */
  abstract update(spaceId: string, request: UpdateRequest): Promise<WriteResultDto>;
  /** `POST /spaces/:id/invalidate` — the addressed record closed with its reason, as it stands now. */
  abstract invalidate(spaceId: string, request: InvalidateRequest): Promise<MemoryRecordDto>;
  /** `POST /spaces/:id/recall` — the memories the request's routes reached, ranked and cited. */
  abstract recall(spaceId: string, request: RecallRequest): Promise<RecallResultDto>;
  /** `POST /spaces/:id/history` — every version of the addressed record's identity, oldest first. */
  abstract history(spaceId: string, request: HistoryRequest): Promise<MemoryRecordDto[]>;
  /** `POST /spaces/:id/consolidate` — what consolidation did with the lessons and playbooks in scope. */
  abstract consolidate(
    spaceId: string,
    request: ConsolidateRequest,
  ): Promise<ConsolidationResultDto>;
  /** `POST /spaces/:id/digests` — a text handed in to be digested on the loop; the orchestration it opened, to be polled. */
  abstract startDigest(
    spaceId: string,
    request: DigestRequest,
  ): Promise<OrchestrationRunStartedDto>;
  /** `GET /spaces/:id/digests/:runId` — the digest as the host reads it back; null when the host has no such space or digest. */
  abstract getDigest(spaceId: string, orchestrationRunId: string): Promise<DigestDto | null>;
  /** `POST /spaces/:id/digests/:runId/remember` — the endorsed memories remembered once; what each write did. */
  abstract applyDigest(spaceId: string, orchestrationRunId: string): Promise<AppliedDigestDto>;
}

/** A route of the host as it declares one: the method, and the path with each parameter a `:name`. */
export interface HostRoute {
  readonly method: 'GET' | 'POST' | 'PUT';
  readonly route: string;
}

/**
 * Each verb's route as the host declares it, once for every adapter: where
 * the HTTP adapter sends the verb, and the words any adapter's error names as
 * what was asked — so a consumer reads the same route from a refusal whichever
 * adapter raised it. Typed over the port's own methods, so a verb added to the
 * port does not compile until it has its route.
 */
export const ROUTES = {
  getSpace: { method: 'GET', route: '/spaces/:id' },
  getSpaceByName: { method: 'GET', route: '/spaces/by-name/:name' },
  ensureSpace: { method: 'PUT', route: '/spaces/by-name/:name' },
  remember: { method: 'POST', route: '/spaces/:id/remember' },
  update: { method: 'POST', route: '/spaces/:id/update' },
  invalidate: { method: 'POST', route: '/spaces/:id/invalidate' },
  recall: { method: 'POST', route: '/spaces/:id/recall' },
  history: { method: 'POST', route: '/spaces/:id/history' },
  consolidate: { method: 'POST', route: '/spaces/:id/consolidate' },
  startDigest: { method: 'POST', route: '/spaces/:id/digests' },
  getDigest: { method: 'GET', route: '/spaces/:id/digests/:runId' },
  applyDigest: { method: 'POST', route: '/spaces/:id/digests/:runId/remember' },
} as const satisfies Record<keyof MemoryClient, HostRoute>;

/** The words an error names: the route as the host declares it, with its method. */
export const routeOf = ({ method, route }: HostRoute): string => `${method} ${route}`;
