import type { ApiListResponse } from '@sysdesign/contracts';
import { z } from 'zod';

/**
 * The page fields of a list query, spread into its strict schema so the
 * strictness holds. Query strings arrive as text, so the numbers are coerced
 * here, at the HTTP edge; an absent `limit` takes the endpoint's default, so
 * no controller writes `?? DEFAULT` again.
 */
export const pageFields = (max: number, fallback: number) => ({
  limit: z.coerce.number().int().min(1).max(max).default(fallback),
  offset: z.coerce.number().int().min(0).default(0),
});

/** A page and where it sits in the whole: the `{ data, meta }` envelope. */
export const page = <T>(
  data: T[],
  total: number,
  query: { limit: number; offset: number },
): ApiListResponse<T> => ({ data, meta: { total, limit: query.limit, offset: query.offset } });
