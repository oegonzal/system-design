import type { AttemptRecord, Attempted, SourceFailure } from '../../../core/budget';
import { messageOf } from '../../../core/text';

/**
 * SAM.gov over plain `fetch`: every API the key reaches is one GET with the
 * key in the query string, so this is the one place the key is appended and
 * the one place provider strings are redacted. Transport, sleep and clock are
 * injectable — the seam every network adapter in this repo has — so a spec
 * never touches the network and never needs a real key.
 *
 * Every HTTP attempt is reported, so the ledger counts what the provider
 * counted. The retry policy is data: server errors and dropped connections
 * are retried once after a bounded pause; a timeout is not (thirty seconds
 * is already too long), and a 429 never is — a second request against a
 * spent quota is a spent request.
 */
export const SAM_GOV_SOURCE_ID = 'sam.gov';

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

export type SamGovTransport = (input: string, init: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

export interface SamGovHttpOptions {
  apiKey: string;
  fetch?: SamGovTransport;
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

export class SamGovHttp {
  private readonly apiKey: string;
  private readonly transport: SamGovTransport;
  private readonly sleep: Sleep;
  private readonly now: () => Date;

  constructor(options: SamGovHttpOptions) {
    this.apiKey = options.apiKey;
    this.transport = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.sleep =
      options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms).unref?.()));
    this.now = options.now ?? (() => new Date());
  }

  /** GET `url` with `params` and the key; every attempt reported. */
  async get(url: string, params: URLSearchParams): Promise<Attempted<HttpResult>> {
    const attempts: AttemptRecord[] = [];
    let result: HttpResult = failure('error', null, 'no attempt');
    for (let attempt = 0; attempt < RETRY_POLICY.attempts; attempt += 1) {
      const startedAt = this.now();
      let response: Response | Error;
      try {
        response = await this.request(url, params);
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

  /** GET and parse JSON; a body that is not JSON is `invalid-response`, never records. */
  async json(
    url: string,
    params: URLSearchParams,
  ): Promise<Attempted<{ kind: 'ok'; body: unknown } | SourceFailure>> {
    const { attempts, result } = await this.get(url, params);
    if (result.kind !== 'ok') return { attempts, result };
    try {
      return { attempts, result: { kind: 'ok', body: (await result.response.json()) as unknown } };
    } catch (error) {
      return { attempts, result: this.invalid(`body is not JSON: ${messageOf(error)}`) };
    }
  }

  /** A failure with the provider's own words, bounded and redacted. */
  invalid(message: string): SourceFailure {
    return failure('invalid-response', 200, this.redact(message));
  }

  redact(text: string): string {
    return this.apiKey.length > 0 ? text.split(this.apiKey).join('[api_key]') : text;
  }

  private request(url: string, params: URLSearchParams): Promise<Response> {
    const target = new URL(url);
    for (const [name, value] of params) target.searchParams.set(name, value);
    // The key is appended here and nowhere else; the URL is never logged.
    target.searchParams.set('api_key', this.apiKey);
    return this.transport(target.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
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
