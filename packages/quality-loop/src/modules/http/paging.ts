/**
 * What every list endpoint shares: the page a query names, coerced at the
 * edge — never in core/ — and the envelope a page is answered in.
 */
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, type ApiListResponse } from '@sysdesign/contracts';
import { z } from 'zod';

/** The page fields, spread into a strict query schema so its strictness holds. */
export const PAGE_FIELDS = {
  limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
};

/** A page and where it sits in the whole. */
export const page = <T>(
  data: T[],
  total: number,
  query: { limit: number; offset: number },
): ApiListResponse<T> => ({ data, meta: { total, limit: query.limit, offset: query.offset } });
