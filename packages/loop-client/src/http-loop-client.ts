import type {
  ApiResponse,
  DeriveCriteriaRequest,
  DerivedCriteriaDto,
  OrchestrationRunDto,
  OrchestrationRunStartedDto,
  PromptLibraryDocumentDto,
  PromptLibraryEntryDto,
  QualityLoopHealthDto,
  QualityRunDto,
  QualityRunStartedDto,
  StartOrchestrationFromRunRequest,
  StartOrchestrationRequest,
  StartQualityRunRequest,
} from '@sysdesign/contracts';

import { defaultSleep } from './await-run';
import { LoopClient } from './loop-client';
import { DerivationFailed, LoopRefused, LoopTimeout, LoopUnreachable } from './loop-errors';

/** A read or a start answers at once; deriving a rubric is one model call and may take minutes. */
export const READ_TIMEOUT_MS = 15_000;
export const DERIVE_TIMEOUT_MS = 180_000;

type Method = 'GET' | 'POST';

interface Answer {
  status: number;
  body: unknown;
}

/** One request's outcome: the loop's answer, or the error that came instead of one. */
type Attempt = { answer: Answer } | { error: LoopTimeout | LoopUnreachable };

/**
 * How long a caller rides out a loop that is restarting. Within the window a
 * call that is safe to ask again is asked again at the pause: one that never
 * reached the loop — the connection failed, never a timeout, which the loop
 * may have received — and a read the loop answered 5xx. A start the loop
 * answered is never repeated, whatever it said: it may have opened a run.
 * Past the window the call fails as it would have at once.
 */
export interface LoopRecovery {
  windowMs: number;
  pauseMs: number;
  /** The clock and the wait, injectable so a spec need not wait. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** No window: a caller that serves people says the loop is down rather than wait on it. */
const NO_RECOVERY: LoopRecovery = { windowMs: 0, pauseMs: 0 };

/** Whether an attempt may be asked again: the loop never had it, or it was a read the loop failed. */
const repeatable = (method: Method, attempt: Attempt): boolean =>
  'error' in attempt
    ? attempt.error instanceof LoopUnreachable
    : method === 'GET' && attempt.answer.status >= 500;

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

const describeCause = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** The loop's own error message, when its body carried one. */
const messageOf = (body: unknown): string => {
  if (body && typeof body === 'object' && 'message' in body) {
    const { message } = body as { message: unknown };
    return typeof message === 'string' ? message : JSON.stringify(message);
  }
  return body === undefined ? '' : JSON.stringify(body);
};

const data = <T>(body: unknown): T => (body as ApiResponse<T>).data;

const segment = encodeURIComponent;

/**
 * The quality loop over HTTP. A timeout is `LoopTimeout`, a dead socket
 * `LoopUnreachable`, a refusing answer `LoopRefused` with the loop's own
 * message and the route, and a 503 from `/criteria` — no model — is
 * `DerivationFailed` carrying the availability, so a caller can say why. A 404
 * on a read is `null`, not an error: the caller decides what a missing run
 * means. A caller that declares a `LoopRecovery` has a restarting loop ridden
 * out within its window; none does by default. The one thing this adapter
 * knows about Nest is nothing.
 */
export class HttpLoopClient extends LoopClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly recovery: LoopRecovery = NO_RECOVERY,
  ) {
    super();
  }

  async health(): Promise<QualityLoopHealthDto> {
    const answer = await this.call('GET', '/health', undefined, READ_TIMEOUT_MS);
    if (answer.status !== 200) throw this.refused('GET /health', answer);
    return answer.body as QualityLoopHealthDto;
  }

  async deriveCriteria(request: DeriveCriteriaRequest): Promise<DerivedCriteriaDto> {
    const answer = await this.call('POST', '/criteria', request, DERIVE_TIMEOUT_MS);
    if (answer.status === 200) return data<DerivedCriteriaDto>(answer.body);
    if (answer.status === 503) {
      const body = answer.body as { llm?: unknown; diagnostic?: unknown };
      throw new DerivationFailed(
        `the quality loop could not derive criteria: ${messageOf(answer.body)}`,
        (body.llm as DerivedCriteriaDto['llm'] | undefined) ?? null,
        (body.diagnostic as DerivedCriteriaDto['diagnostic'] | undefined) ?? null,
      );
    }
    throw this.refused('POST /criteria', answer);
  }

  async startRun(request: StartQualityRunRequest): Promise<QualityRunStartedDto> {
    return this.started<QualityRunStartedDto>('/runs', request);
  }

  async getRun(runId: string): Promise<QualityRunDto | null> {
    return this.read<QualityRunDto>(`/runs/${segment(runId)}`, 'GET /runs/:id');
  }

  async listPrompts(): Promise<PromptLibraryEntryDto[]> {
    const answer = await this.call('GET', '/prompts', undefined, READ_TIMEOUT_MS);
    if (answer.status !== 200) throw this.refused('GET /prompts', answer);
    return data<PromptLibraryEntryDto[]>(answer.body);
  }

  async getPrompt(id: string): Promise<PromptLibraryDocumentDto | null> {
    // A library id is a path (`agentic/workflow-graph-engine`): encode each
    // segment on its own so the separator survives as a route segment.
    const path = `/prompts/${id.split('/').map(segment).join('/')}`;
    return this.read<PromptLibraryDocumentDto>(path, 'GET /prompts/:id');
  }

  async startOrchestration(
    orchestrator: string,
    request: StartOrchestrationRequest,
  ): Promise<OrchestrationRunStartedDto> {
    return this.started<OrchestrationRunStartedDto>(
      `/orchestrations/${segment(orchestrator)}`,
      request,
    );
  }

  async startOrchestrationFromRun(
    orchestrator: string,
    request: StartOrchestrationFromRunRequest,
  ): Promise<OrchestrationRunStartedDto> {
    return this.started<OrchestrationRunStartedDto>(
      `/orchestrations/${segment(orchestrator)}/from-run`,
      request,
    );
  }

  async getOrchestration(orchestrationRunId: string): Promise<OrchestrationRunDto | null> {
    return this.read<OrchestrationRunDto>(
      `/orchestrations/${segment(orchestrationRunId)}`,
      'GET /orchestrations/:id',
    );
  }

  /** A start answers 202 — or 200 from an older build — with the envelope. */
  private async started<T>(path: string, request: unknown): Promise<T> {
    const answer = await this.call('POST', path, request, READ_TIMEOUT_MS);
    if (answer.status === 202 || answer.status === 200) return data<T>(answer.body);
    throw this.refused(`POST ${path}`, answer);
  }

  /** A read answers 200 with the envelope, or 404 as null. */
  private async read<T>(path: string, route: string): Promise<T | null> {
    const answer = await this.call('GET', path, undefined, READ_TIMEOUT_MS);
    if (answer.status === 404) return null;
    if (answer.status !== 200) throw this.refused(route, answer);
    return data<T>(answer.body);
  }

  /** The loop's answer, asked again within the declared recovery while the attempt is repeatable. */
  private async call(
    method: Method,
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<Answer> {
    const { windowMs, pauseMs, now = Date.now, sleep = defaultSleep } = this.recovery;
    const deadline = now() + windowMs;
    for (;;) {
      const attempt = await this.attempt(method, path, body, timeoutMs);
      if (!repeatable(method, attempt) || now() + pauseMs >= deadline) {
        if ('error' in attempt) throw attempt.error;
        return attempt.answer;
      }
      await sleep(pauseMs);
    }
  }

  private async attempt(
    method: Method,
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<Attempt> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      return {
        error: isTimeout(error)
          ? new LoopTimeout(`${method} ${path}`, timeoutMs)
          : new LoopUnreachable(describeCause(error)),
      };
    }
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    return { answer: { status: response.status, body: parsed } };
  }

  private refused(route: string, answer: Answer): LoopRefused {
    return new LoopRefused(answer.status, messageOf(answer.body), route);
  }
}
