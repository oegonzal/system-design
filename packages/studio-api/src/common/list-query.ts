import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from '@sysdesign/contracts';
import { z } from 'zod';

/**
 * The paging half of every list query. Query strings arrive as text, so the
 * numbers are coerced; an absent value takes the contract's default, so a
 * controller never has to write `?? DEFAULT_LIST_LIMIT` again.
 */
export const listQueryShape = {
  limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).default(DEFAULT_LIST_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
};

export interface ListQuery {
  limit: number;
  offset: number;
}
