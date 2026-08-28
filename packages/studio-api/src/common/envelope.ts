import type { ApiListResponse, ApiResponse, ListMeta } from '@sysdesign/contracts';

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

/** Collection: `{ data, meta }`. */
export const page = <T>(data: T[], meta: ListMeta): ApiListResponse<T> => ({ data, meta });
