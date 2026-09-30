import type { AttemptRecord, Attempted, SourceFailure } from '../../core/budget';
import { messageOf } from '../../core/text';

/**
 * An upstream over plain `fetch` that reports every HTTP attempt, so the
 * ledger counts what the provider counted. Transport, sleep and clock are
 * injectable — the seam every network adapter in this repo has — so a spec
 * never touches the network. A source decorates the request (SAM.gov
 * appends its key) and names the secrets to redact from every message.
 *
 * The retry policy is data: server errors and dropped connections are
 * retried once after a bounded pause; a timeout is not (thirty seconds is
 * already too long), and a 429 never is — a second request against a spent
 * quota is a spent request.
 */
export const RETRY_POLICY = {
  /** Attempts per call, the first included. */
  attempts: 2,
  statuses: [500, 502, 503, 504] as readonly number[],
  networkErrors: true,
  defaultDelayMs: 1_000,
  maxDelayMs: 10_000,
} as const;

/** A stalled provider must not hold a pull for undici's five-minute default. */
export const REQUEST_TIMEOUT_MS = 30_000;
const ERROR_BODY_CHARS = 200;

export type Transport = (input: string, init: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

export interface AttemptedHttpOptions {
  /** Applied to every request URL — where a key is appended, and nowhere else. */
  decorate?: (target: URL) => void;
  /** Strings that must never reach a message; each is replaced by its label. */
  secrets?: readonly { value: string; label: string }[];
  fetch?: Transport;
  sleep?: Sleep;
  now?: () => Date;
}

/** The response, usable, or the port's failure — after the attempts the policy allows. */
export type HttpResult = { kind: 'ok'; response: Response } | SourceFailure;

const retryAfterMs = (response: Response): number => {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, RETRY_POLICY.maxDelayMs)
    : RETRY_POLICY.defaultDelayMs;
};

const isTimeout = (error: Error): boolean =>
  error.name === 'AbortError' || error.name === 'TimeoutError';

const failure = (
  outcome: SourceFailure['outcome'],
  status: number | null,
  message: string,
): SourceFailure => ({ kind: 'error', outcome, status, message });

export class AttemptedHttp {
  private readonly decorate: (target: URL) => void;
  private readonly secrets: readonly { value: string; label: string }[];
  private readonly transport: Transport;
  private readonly sleep: Sleep;
  private readonly now: () => Date;

  constructor(options: AttemptedHttpOptions = {}) {
    this.decorate = options.decorate ?? (() => undefined);
    this.secrets = (options.secrets ?? []).filter((secret) => secret.value.length > 0);
    this.transport = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.sleep =
      options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms).unref?.()));
    this.now = options.now ?? (() => new Date());
  }

  /** GET `url` with `params`; every attempt reported. */
  get(url: string, params: URLSearchParams): Promise<Attempted<HttpResult>> {
    return this.attempt(url, params, { method: 'GET', headers: { accept: 'application/json' } });
  }

  /** POST `body` as JSON to `url`; every attempt reported. */
  post(url: string, body: unknown): Promise<Attempted<HttpResult>> {
    return this.attempt(url, new URLSearchParams(), {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /** GET and parse JSON; a body that is not JSON is `invalid-response`, never records. */
  async json(
    url: string,
    params: URLSearchParams,
  ): Promise<Attempted<{ kind: 'ok'; body: unknown } | SourceFailure>> {
    return this.parsed(await this.get(url, params));
  }

  /** POST and parse JSON. */
  async postJson(
    url: string,
    body: unknown,
  ): Promise<Attempted<{ kind: 'ok'; body: unknown } | SourceFailure>> {
    return this.parsed(await this.post(url, body));
  }

  /** A failure with the provider's own words, bounded and redacted. */
  invalid(message: string): SourceFailure {
    return failure('invalid-response', 200, this.redact(message));
  }

  redact(text: string): string {
    return this.secrets.reduce(
      (redacted, secret) => redacted.split(secret.value).join(secret.label),
      text,
    );
  }

  private async parsed({
    attempts,
    result,
  }: Attempted<HttpResult>): Promise<Attempted<{ kind: 'ok'; body: unknown } | SourceFailure>> {
    if (result.kind !== 'ok') return { attempts, result };
    try {
      return { attempts, result: { kind: 'ok', body: (await result.response.json()) as unknown } };
    } catch (error) {
      return { attempts, result: this.invalid(`body is not JSON: ${messageOf(error)}`) };
    }
  }

  private async attempt(
    url: string,
    params: URLSearchParams,
    init: RequestInit,
  ): Promise<Attempted<HttpResult>> {
    const attempts: AttemptRecord[] = [];
    let result: HttpResult = failure('error', null, 'no attempt');
    for (let attempt = 0; attempt < RETRY_POLICY.attempts; attempt += 1) {
      const startedAt = this.now();
      let response: Response | Error;
      try {
        response = await this.request(url, params, init);
      } catch (error) {
        response = error instanceof Error ? error : new Error(messageOf(error));
      }
      const durationMs = Math.max(0, this.now().getTime() - startedAt.getTime());

      result = await this.outcome(response);
      attempts.push({
        startedAt,
        durationMs,
        status: result.kind === 'ok' ? result.response.status : result.status,
        outcome: result.kind === 'ok' ? 'ok' : result.outcome,
        error: result.kind === 'ok' ? null : result.message,
      });

      const retryable =
        response instanceof Error
          ? RETRY_POLICY.networkErrors && !isTimeout(response)
          : RETRY_POLICY.statuses.includes(response.status);
      if (!retryable || attempt + 1 >= RETRY_POLICY.attempts) break;
      await this.sleep(
        response instanceof Error ? RETRY_POLICY.defaultDelayMs : retryAfterMs(response),
      );
    }
    return { attempts, result };
  }

  private request(url: string, params: URLSearchParams, init: RequestInit): Promise<Response> {
    const target = new URL(url);
    for (const [name, value] of params) target.searchParams.set(name, value);
    // A secret is appended here and nowhere else; the URL is never logged.
    this.decorate(target);
    return this.transport(target.toString(), {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  /** A dropped connection, a rate limit or a non-2xx status as the port's failure; the response when usable. */
  private async outcome(response: Response | Error): Promise<HttpResult> {
    if (response instanceof Error) {
      return failure('error', null, this.redact(response.message));
    }
    if (response.status === 429) {
      return failure('rate-limited', 429, `rate limited${await this.detail(response)}`);
    }
    if (!response.ok) {
      return failure(
        'error',
        response.status,
        `status ${response.status}${await this.detail(response)}`,
      );
    }
    return { kind: 'ok', response };
  }

  /** The provider's own words, bounded and redacted — a bad key is otherwise a bare status. */
  private async detail(response: Response): Promise<string> {
    try {
      const text = (await response.text()).replace(/\s+/g, ' ').trim();
      return text.length > 0 ? ` — ${this.redact(text.slice(0, ERROR_BODY_CHARS))}` : '';
    } catch {
      return '';
    }
  }
}

/** The first few zod issues as one line. */
export const issuesOf = (issues: readonly { path: PropertyKey[]; message: string }[]): string =>
  issues
    .slice(0, 3)
    .map((issue) => `${issue.path.map(String).join('.') || '(root)'} ${issue.message}`)
    .join('; ');
