import type { ApiResponse, ApiValidationIssue } from '@sysdesign/contracts';

/**
 * The HTTP request core every web app's typed client is built on. An app
 * binds its own base URL with `createRequest` — the `NEXT_PUBLIC_*` read
 * stays in app code, where Next inlines it — and layers its endpoints on top.
 */

/**
 * A non-2xx response, carrying the parsed error body. Errors are Nest-shaped
 * (`{ statusCode, message }`, message possibly an array of validation
 * strings) — `message` here is already flattened for display, and names
 * every offending field when the server named them.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  /** The fields a refused request got wrong — a schema-validation 400 names each path; empty otherwise. */
  readonly issues: readonly ApiValidationIssue[];

  constructor(status: number, body: unknown) {
    const issues = issuesFrom(body);
    super(errorMessageFrom(status, body, issues));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.issues = issues;
  }
}

const isIssue = (value: unknown): value is ApiValidationIssue =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as ApiValidationIssue).path === 'string' &&
  typeof (value as ApiValidationIssue).message === 'string';

function issuesFrom(body: unknown): ApiValidationIssue[] {
  if (body === null || typeof body !== 'object' || !('issues' in body)) return [];
  const { issues } = body as { issues: unknown };
  return Array.isArray(issues) ? issues.filter(isIssue) : [];
}

/** `tags.1: Too big` — the field first, so a reader knows where to look; a body-level issue has no path. */
const describeIssue = ({ path, message }: ApiValidationIssue): string =>
  path.length > 0 ? `${path}: ${message}` : message;

function serverMessage(body: unknown): string | null {
  if (body === null || typeof body !== 'object' || !('message' in body)) return null;
  const { message } = body as { message: unknown };
  if (typeof message === 'string' && message.length > 0) return message;
  if (Array.isArray(message) && message.length > 0) return message.join('; ');
  return null;
}

function errorMessageFrom(
  status: number,
  body: unknown,
  issues: readonly ApiValidationIssue[],
): string {
  const message = serverMessage(body) ?? `Request failed with status ${status}`;
  return issues.length > 0 ? `${message} — ${issues.map(describeIssue).join('; ')}` : message;
}

/** Aborted fetches are lifecycle noise, not failures — callers branch on this. */
export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/** What a failure the server never answered — a dropped connection, a refused socket — says to a reader. */
export const UNREACHABLE_COPY =
  'Could not reach the server. Check your connection, then try again.';

/**
 * The one place an unknown catch turns into copy a person can read: the
 * server's own words for a request it answered, the caller's fallback for
 * everything else. A dropped connection throws `TypeError: Failed to fetch`
 * — the browser's words, not a sentence for the person reading the page.
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Why a read of one resource, by its address, came back without it.
 *
 * - `missing`: nothing lives at the address. A 404 says so; so does a 400,
 *   because a read that carries nothing but its address can only be refused
 *   for an address that cannot name anything — a malformed id. Reading again
 *   will not change either.
 * - `failed`: the read itself failed — the network, the server — and may
 *   succeed if tried again. `message` is copy a person can read.
 */
export type ReadFailure = { kind: 'missing' } | { kind: 'failed'; message: string };

/** The statuses with which a by-address read says the address names nothing. */
const ADDRESS_NAMES_NOTHING: ReadonlySet<number> = new Set([400, 404]);

/** Classifies what a by-address read (`GET /things/:id`) threw; see `ReadFailure`. */
export function readFailureOf(error: unknown, fallback: string): ReadFailure {
  if (error instanceof ApiError && ADDRESS_NAMES_NOTHING.has(error.status)) {
    return { kind: 'missing' };
  }
  return { kind: 'failed', message: toErrorMessage(error, fallback) };
}

/** Builds `?a=1&b=two`, dropping undefined but keeping legitimate zeros. */
export function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded.length > 0 ? `?${encoded}` : '';
}

/** Cancellation — every GET, and any POST a component can outlive. */
export interface GetOptions {
  signal?: AbortSignal;
}

export interface RequestOptions extends GetOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

export type RequestFn = <T>(path: string, options?: RequestOptions) => Promise<T>;

/**
 * Binds a base URL once per app. `fetch` is looked up per call, not captured
 * here, so a spec's `vi.stubGlobal('fetch', …)` intercepts every request.
 */
export function createRequest(baseUrl: string): RequestFn {
  return async <T>(
    path: string,
    { method = 'GET', body, signal }: RequestOptions = {},
  ): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      ...(signal ? { signal } : {}),
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });

    if (!response.ok) {
      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        parsed = undefined;
      }
      throw new ApiError(response.status, parsed);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };
}

export const unwrap = <T>(envelope: ApiResponse<T>): T => envelope.data;
