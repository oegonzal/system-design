import type { ApiResponse } from '@sysdesign/contracts';

/**
 * The HTTP request core every web app's typed client is built on. An app
 * binds its own base URL with `createRequest` — the `NEXT_PUBLIC_*` read
 * stays in app code, where Next inlines it — and layers its endpoints on top.
 */

/**
 * A non-2xx response, carrying the parsed error body. Errors are Nest-shaped
 * (`{ statusCode, message }`, message possibly an array of validation
 * strings) — `message` here is already flattened for display.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(errorMessageFrom(status, body));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function errorMessageFrom(status: number, body: unknown): string {
  if (body !== null && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
    if (Array.isArray(message) && message.length > 0) return message.join('; ');
  }
  return `Request failed with status ${status}`;
}

/** Aborted fetches are lifecycle noise, not failures — callers branch on this. */
export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/** The one place an unknown catch turns into copy a person can read. */
export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message.length > 0 && !isAbortError(error)) {
    return error.message;
  }
  return fallback;
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
