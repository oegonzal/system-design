import type { ApiResponse } from '@sysdesign/contracts';

/**
 * Envelope constructors.
 *
 * Called explicitly in controllers rather than applied by a global response
 * interceptor. An interceptor that rewraps the body would make every
 * controller's declared return type a lie — the method would say
 * `PromptDto[]` while the client receives `{ data: PromptDto[] }` — which
 * defeats the point of sharing types with the frontend at all.
 */

/** Single resource: `{ data }`. */
export const ok = <T>(data: T): ApiResponse<T> => ({ data });

// Collections use nest-kit `page`, the one `{ data, meta }` envelope every API shares.
