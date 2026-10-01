import {
  BadGatewayException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  ApiResponse,
  DeriveCriteriaRequest,
  DerivedCriteriaDto,
  PromptLibraryDocumentDto,
  PromptLibraryEntryDto,
  QualityRunDto,
  QualityRunStartedDto,
  StartQualityRunRequest,
} from '@sysdesign/contracts';

import { QualityLoopClient, type QualityLoopHealth } from './quality-loop.client';

/** A read or a start answers at once; deriving a rubric is one model call and may take minutes. */
export const READ_TIMEOUT_MS = 15_000;
export const DERIVE_TIMEOUT_MS = 180_000;

type Method = 'GET' | 'POST';

interface Answer {
  status: number;
  body: unknown;
}

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

const describe = (error: unknown): string =>
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

/**
 * The quality loop over HTTP. Its failures become the studio's gateway
 * errors — `LOOP_UNAVAILABLE_STATUSES`: a timeout is 504, an unreachable
 * service 503 and a refusing one 502, and a 503 from `/criteria` — no model —
 * is passed through as 503 with the availability, so the client can say why.
 * A 404 on a read is `null`, not an error: the caller decides what a missing
 * run means.
 */
export class HttpQualityLoopClient extends QualityLoopClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
  }

  async health(): Promise<QualityLoopHealth> {
    const answer = await this.call('GET', '/health', undefined, READ_TIMEOUT_MS);
    if (answer.status !== 200) throw this.refused('GET /health', answer);
    return answer.body as QualityLoopHealth;
  }

  async deriveCriteria(request: DeriveCriteriaRequest): Promise<DerivedCriteriaDto> {
    const answer = await this.call('POST', '/criteria', request, DERIVE_TIMEOUT_MS);
    if (answer.status === 200) return data<DerivedCriteriaDto>(answer.body);
    if (answer.status === 503) {
      const body = answer.body as { llm?: unknown; diagnostic?: unknown };
      throw new ServiceUnavailableException({
        message: `the quality loop could not derive criteria: ${messageOf(answer.body)}`,
        llm: body.llm ?? null,
        diagnostic: body.diagnostic ?? null,
      });
    }
    throw this.refused('POST /criteria', answer);
  }

  async startRun(request: StartQualityRunRequest): Promise<QualityRunStartedDto> {
    const answer = await this.call('POST', '/runs', request, READ_TIMEOUT_MS);
    if (answer.status === 202 || answer.status === 200) {
      return data<QualityRunStartedDto>(answer.body);
    }
    throw this.refused('POST /runs', answer);
  }

  async getRun(runId: string): Promise<QualityRunDto | null> {
    const answer = await this.call(
      'GET',
      `/runs/${encodeURIComponent(runId)}`,
      undefined,
      READ_TIMEOUT_MS,
    );
    if (answer.status === 404) return null;
    if (answer.status !== 200) throw this.refused('GET /runs/:id', answer);
    return data<QualityRunDto>(answer.body);
  }

  async listPrompts(): Promise<PromptLibraryEntryDto[]> {
    const answer = await this.call('GET', '/prompts', undefined, READ_TIMEOUT_MS);
    if (answer.status !== 200) throw this.refused('GET /prompts', answer);
    return data<PromptLibraryEntryDto[]>(answer.body);
  }

  async getPrompt(id: string): Promise<PromptLibraryDocumentDto | null> {
    // A library id is a path (`agentic/workflow-graph-engine`): encode each
    // segment on its own so the separator survives as a route segment.
    const path = `/prompts/${id.split('/').map(encodeURIComponent).join('/')}`;
    const answer = await this.call('GET', path, undefined, READ_TIMEOUT_MS);
    if (answer.status === 404) return null;
    if (answer.status !== 200) throw this.refused('GET /prompts/:id', answer);
    return data<PromptLibraryDocumentDto>(answer.body);
  }

  private async call(
    method: Method,
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<Answer> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (isTimeout(error)) {
        throw new GatewayTimeoutException(
          `the quality loop did not answer ${method} ${path} within ${timeoutMs} ms`,
        );
      }
      // A grader nobody can reach is unavailable, not a gateway that answered badly.
      throw new ServiceUnavailableException(`the quality loop is unreachable: ${describe(error)}`);
    }
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed };
  }

  private refused(route: string, answer: Answer): BadGatewayException {
    return new BadGatewayException(
      `the quality loop refused ${route} (${answer.status}): ${messageOf(answer.body)}`,
    );
  }
}
