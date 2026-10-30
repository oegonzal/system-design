import {
  isSpaceRefusal,
  NO_RECOVERY,
  rideOut,
  type ApiResponse,
  type ApiValidationIssue,
  type AppliedDigestDto,
  type CompileReportDto,
  type ConsolidationResultDto,
  type createSpaceRequestSchema,
  type DigestDto,
  type EnsuredSpaceDto,
  type MemoryRecordDto,
  type MemorySpaceDto,
  type OrchestrationRunStartedDto,
  type RecallResultDto,
  type Recovery,
  type RecoveryClock,
  type Settled,
  type WriteResultDto,
} from '@sysdesign/contracts';
import type { z } from 'zod';

import {
  MemoryClient,
  routeOf,
  ROUTES,
  type ConsolidateRequest,
  type DigestRequest,
  type HistoryRequest,
  type HostRoute,
  type InvalidateRequest,
  type RecallRequest,
  type RememberRequest,
  type UpdateRequest,
} from './memory-client';
import {
  MemoryHostRefused,
  MemoryHostTimeout,
  MemoryHostUnreachable,
  SpaceNotCompiled,
} from './memory-errors';

/**
 * How long any one call may take. No verb of the port calls a model: a recall
 * that names a text embeds it once and reads an index, and every other verb
 * reads or writes rows — so one bound serves every row of the table. A digest
 * is only started here; it runs on the loop for minutes and is read back
 * through `getDigest`, one call at a time.
 */
const CALL_TIMEOUT_MS = 15_000;

export interface HttpMemoryOptions {
  /**
   * How long a restarting host is ridden out: within the window a repeatable
   * call — the table below says which — that nobody answered, or that the host
   * answered 5xx, is asked again at the pause. A write is asked once whatever
   * happened to it, a call the host held past its time is asked once, and
   * absent a recovery every call is asked once.
   */
  recovery?: Recovery;
  /** The clock the recovery is kept by; a spec passes one that need not wait. */
  clock?: RecoveryClock;
  /** How long any one call may take; `CALL_TIMEOUT_MS` unless said otherwise. */
  callTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * One row of the table: the verb's route as the host declares it (`ROUTES`),
 * and what this adapter decides for it. `ok` is the status the host answers
 * when it did what was asked. `repeatable` says whether the call may be asked
 * again within the recovery when nobody answered it or the host failed it: a
 * read may, and the ensure, idempotent by name; a write may not, however it
 * failed — a dead socket does not say whether the host received it, and it
 * may have done its work. `absent` says what a not-found the host raises is:
 * null for an unscoped read; a refusal for everything else.
 */
interface Operation extends HostRoute {
  readonly ok: number;
  readonly repeatable: boolean;
  readonly absent: 'null' | 'refused';
}

/**
 * Every verb of the port and what this adapter decides for it, declared once:
 * the one table each method reads its route, status, retry and absence rule
 * from, so no method decides any of it for itself. Typed over the port's own
 * methods, so a verb added to the port does not compile until it has its row.
 */
const OPERATIONS = {
  getSpace: { ...ROUTES.getSpace, ok: 200, repeatable: true, absent: 'null' },
  getSpaceByName: { ...ROUTES.getSpaceByName, ok: 200, repeatable: true, absent: 'null' },
  ensureSpace: { ...ROUTES.ensureSpace, ok: 200, repeatable: true, absent: 'refused' },
  remember: { ...ROUTES.remember, ok: 200, repeatable: false, absent: 'refused' },
  update: { ...ROUTES.update, ok: 200, repeatable: false, absent: 'refused' },
  invalidate: { ...ROUTES.invalidate, ok: 200, repeatable: false, absent: 'refused' },
  recall: { ...ROUTES.recall, ok: 200, repeatable: true, absent: 'refused' },
  history: { ...ROUTES.history, ok: 200, repeatable: true, absent: 'refused' },
  consolidate: { ...ROUTES.consolidate, ok: 200, repeatable: false, absent: 'refused' },
  startDigest: { ...ROUTES.startDigest, ok: 202, repeatable: false, absent: 'refused' },
  getDigest: { ...ROUTES.getDigest, ok: 200, repeatable: true, absent: 'null' },
  applyDigest: { ...ROUTES.applyDigest, ok: 200, repeatable: false, absent: 'refused' },
} as const satisfies Record<keyof MemoryClient, Operation>;

/** A route parameter as the host declares one: `:id`, `:name`, `:runId`. */
const PARAMETER = /:([A-Za-z]+)/g;

/**
 * The names a route's parameters declare, so a call fills exactly those —
 * `{ id, runId }` for `/spaces/:id/digests/:runId` — checked where it is written.
 */
type ParametersOf<Route extends string> = Route extends `${string}:${infer Name}/${infer Rest}`
  ? Record<Name | keyof ParametersOf<Rest>, string>
  : Route extends `${string}:${infer Name}`
    ? Record<Name, string>
    : Record<never, string>;

/** The route's path for one call: each parameter filled with its value, encoded as one segment. */
const pathOf = (route: string, parameters: Readonly<Record<string, string>>): string =>
  route.replace(PARAMETER, (_, name: string) => encodeURIComponent(parameters[name]));

interface Answer {
  status: number;
  body: unknown;
}

/**
 * Whether an attempt may be asked again within the declared recovery: only on
 * a row that declares itself repeatable, and then when nobody answered or the
 * host answered 5xx. The row alone decides, never the fault: a connection the
 * host refused and one it reset after the request arrived fail the same way
 * (`TypeError: fetch failed`, measured on Node 24), so a dead socket does not
 * say whether a write was done, and a write is never asked twice. A call the
 * host held past its time is not asked again on any row: the recovery rides
 * out a host that is restarting — one that refuses, resets or fails a call —
 * and a host that holds a call that long is not restarting; asking again
 * within the window would only hold the caller longer.
 */
const repeatable = (operation: Operation, outcome: Settled<Answer>): boolean =>
  operation.repeatable &&
  ('error' in outcome
    ? outcome.error instanceof MemoryHostUnreachable
    : outcome.value.status >= 500);

const describeCause = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** The body as JSON when it parses as JSON, the text when it does not, nothing when there was none. */
async function bodyOf(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    return text;
  }
}

/** What a refusing body may carry, read loosely: the host's declared shape (`refusals.ts`), of which a framework error carries fewer fields. */
interface RefusalFields {
  message?: unknown;
  code?: unknown;
  issues?: unknown;
  missing?: unknown;
  report?: unknown;
}

const fieldsOf = (body: unknown): RefusalFields =>
  body !== null && typeof body === 'object' ? (body as RefusalFields) : {};

/**
 * A not-found the host raised itself: a 404 naming what is missing, as the
 * envelope has every 404 an API raises carry. The framework's own 404 — a
 * route this host does not serve, a wrong base URL — names nothing, and is
 * not the host saying it has no such thing.
 */
const isNotFound = (answer: Answer): boolean =>
  answer.status === 404 && typeof fieldsOf(answer.body).missing === 'string';

/** The host's own message when its body carried one; the body as written otherwise. */
const messageOf = (body: unknown): string => {
  const { message } = fieldsOf(body);
  if (typeof message === 'string') return message;
  return body === undefined ? '' : JSON.stringify(message ?? body);
};

/**
 * A refusing answer as the error it is. A 422 whose body carries the compile
 * report and no code is a strategy that does not compile — the host's
 * `notCompiled`, told apart by its shape, never its message. Any other answer
 * is `MemoryHostRefused` with the status, the route, the declared code (null
 * for a body with none: the validation pipe's 400, a framework error), the
 * host's message, its issues and what was missing.
 */
const refused = (operation: Operation, answer: Answer): MemoryHostRefused | SpaceNotCompiled => {
  const body = fieldsOf(answer.body);
  if (answer.status === 422 && body.report !== undefined && body.code === undefined) {
    return new SpaceNotCompiled(body.report as CompileReportDto);
  }
  return new MemoryHostRefused({
    status: answer.status,
    route: routeOf(operation),
    code: typeof body.code === 'string' && isSpaceRefusal(body.code) ? body.code : null,
    message: messageOf(answer.body),
    issues: Array.isArray(body.issues) ? (body.issues as ApiValidationIssue[]) : [],
    missing: typeof body.missing === 'string' ? body.missing : null,
  });
};

/**
 * The memory host over HTTP. Every verb is one row of `OPERATIONS`, which
 * says where it goes, what the host answers when it did it, whether it may be
 * asked again when nobody answered or the host failed it, and whether a
 * not-found is null. A dead socket is `MemoryHostUnreachable`, a call past
 * its time `MemoryHostTimeout` — the body read as well as the answer — a
 * refusing answer `MemoryHostRefused` with the host's own words and declared
 * code, a strategy that does not compile `SpaceNotCompiled` with its report.
 * A caller that declares a `Recovery` has a restarting host ridden out within
 * its window; none does by default. A success body is the `{ data }`
 * envelope, unwrapped and read as the contracts DTO.
 */
export class HttpMemoryClient extends MemoryClient {
  private readonly recovery: Recovery;
  private readonly clock: RecoveryClock | undefined;
  private readonly callTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    options: HttpMemoryOptions = {},
  ) {
    super();
    this.recovery = options.recovery ?? NO_RECOVERY;
    this.clock = options.clock;
    this.callTimeoutMs = options.callTimeoutMs ?? CALL_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getSpace(spaceId: string): Promise<MemorySpaceDto | null> {
    return this.read(OPERATIONS.getSpace, { id: spaceId });
  }

  getSpaceByName(name: string): Promise<MemorySpaceDto | null> {
    return this.read(OPERATIONS.getSpaceByName, { name });
  }

  ensureSpace(
    name: string,
    request: z.input<typeof createSpaceRequestSchema>,
  ): Promise<EnsuredSpaceDto> {
    return this.ask(OPERATIONS.ensureSpace, { name }, request);
  }

  remember(spaceId: string, request: RememberRequest): Promise<WriteResultDto> {
    return this.ask(OPERATIONS.remember, { id: spaceId }, request);
  }

  update(spaceId: string, request: UpdateRequest): Promise<WriteResultDto> {
    return this.ask(OPERATIONS.update, { id: spaceId }, request);
  }

  invalidate(spaceId: string, request: InvalidateRequest): Promise<MemoryRecordDto> {
    return this.ask(OPERATIONS.invalidate, { id: spaceId }, request);
  }

  recall(spaceId: string, request: RecallRequest): Promise<RecallResultDto> {
    return this.ask(OPERATIONS.recall, { id: spaceId }, request);
  }

  history(spaceId: string, request: HistoryRequest): Promise<MemoryRecordDto[]> {
    return this.ask(OPERATIONS.history, { id: spaceId }, request);
  }

  consolidate(spaceId: string, request: ConsolidateRequest): Promise<ConsolidationResultDto> {
    return this.ask(OPERATIONS.consolidate, { id: spaceId }, request);
  }

  startDigest(spaceId: string, request: DigestRequest): Promise<OrchestrationRunStartedDto> {
    return this.ask(OPERATIONS.startDigest, { id: spaceId }, request);
  }

  getDigest(spaceId: string, orchestrationRunId: string): Promise<DigestDto | null> {
    return this.read(OPERATIONS.getDigest, { id: spaceId, runId: orchestrationRunId });
  }

  applyDigest(spaceId: string, orchestrationRunId: string): Promise<AppliedDigestDto> {
    return this.ask(OPERATIONS.applyDigest, { id: spaceId, runId: orchestrationRunId });
  }

  /** An unscoped read, on a row that declares absence null: the thing, or null when the host says it has no such thing; a 404 that is not the host's is its refusal. */
  private async read<T, O extends Operation & { absent: 'null' }>(
    operation: O,
    parameters: ParametersOf<O['route']>,
  ): Promise<T | null> {
    const answer = await this.call(operation, parameters, undefined);
    return isNotFound(answer) ? null : this.answered<T>(operation, answer);
  }

  /** Every other verb: what the host answered, or its refusal thrown. */
  private async ask<T, O extends Operation & { absent: 'refused' }>(
    operation: O,
    parameters: ParametersOf<O['route']>,
    body?: unknown,
  ): Promise<T> {
    return this.answered<T>(operation, await this.call(operation, parameters, body));
  }

  /** The envelope's payload when the host answered the row's ok status; its refusal otherwise. */
  private answered<T>(operation: Operation, answer: Answer): T {
    if (answer.status !== operation.ok) throw refused(operation, answer);
    return (answer.body as ApiResponse<T>).data;
  }

  /** The host's answer, asked again within the declared recovery while the attempt is repeatable. */
  private call(
    operation: Operation,
    parameters: Readonly<Record<string, string>>,
    body: unknown,
  ): Promise<Answer> {
    const path = pathOf(operation.route, parameters);
    return rideOut(
      this.recovery,
      () => this.attempt(operation, path, body),
      (outcome) => repeatable(operation, outcome),
      this.clock,
    );
  }

  /**
   * One request, status and body: the host's answer, or `MemoryHostTimeout` /
   * `MemoryHostUnreachable` thrown instead of one. The body is read under the
   * same guard as the request, since the time bound covers it too: a host that
   * answers its status and then stalls or cuts the body has not answered.
   */
  private async attempt(operation: Operation, path: string, body: unknown): Promise<Answer> {
    const timeout = AbortSignal.timeout(this.callTimeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: operation.method,
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timeout,
      });
      return { status: response.status, body: await bodyOf(response) };
    } catch (error) {
      if (timeout.aborted) throw new MemoryHostTimeout(routeOf(operation), this.callTimeoutMs);
      throw new MemoryHostUnreachable(describeCause(error));
    }
  }
}
