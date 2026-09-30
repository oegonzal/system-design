import {
  BID_STAGES,
  DEFAULT_PIPELINE_LIMIT,
  MAX_PIPELINE_LIMIT,
  type SaveBidRequest,
} from '@sysdesign/contracts';
import { pageFields } from '@sysdesign/nest-kit';
import { z } from 'zod';

/** The body of `PUT /notices/:noticeId/bid`. Omitted fields keep their stored value; the service merges. */
export const saveBidRequestSchema = z.strictObject({
  stage: z.enum(BID_STAGES),
  notes: z.string().max(20_000).optional(),
  reminderAt: z.iso.datetime({ offset: true }).nullable().optional(),
  estimatedValue: z.number().min(0).max(1e13).nullable().optional(),
}) satisfies z.ZodType<SaveBidRequest>;
export type SaveBidBody = z.output<typeof saveBidRequestSchema>;

/** The query of `GET /pipeline`. */
export const listPipelineQuerySchema = z.strictObject({
  profile: z.string().min(1).optional(),
  stage: z.enum(BID_STAGES).optional(),
  ...pageFields(MAX_PIPELINE_LIMIT, DEFAULT_PIPELINE_LIMIT),
});
export type ListPipelineQueryInput = z.output<typeof listPipelineQuerySchema>;
