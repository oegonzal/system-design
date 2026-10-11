import {
  SOURCE_MAX_LENGTH,
  SUBSCRIPTION_TOPICS_MAX,
  TOPIC_MAX_LENGTH,
  type AckRequest,
  type PublishEventRequest,
  type SubscribeRequest,
} from '@sysdesign/contracts';
import { z } from 'zod';

/** The bus's request bodies and queries, checked at the door; the bus checks what only it can know. */
export const publishEventSchema = z.strictObject({
  topic: z.string().min(1).max(TOPIC_MAX_LENGTH),
  source: z.string().min(1).max(SOURCE_MAX_LENGTH),
  payload: z.unknown(),
}) satisfies z.ZodType<PublishEventRequest>;

export const subscribeSchema = z.strictObject({
  topics: z.array(z.string().min(1).max(TOPIC_MAX_LENGTH)).min(1).max(SUBSCRIPTION_TOPICS_MAX),
}) satisfies z.ZodType<SubscribeRequest>;

export const ackSchema = z.strictObject({
  seq: z.string().regex(/^\d{1,19}$/, 'is not a seq'),
}) satisfies z.ZodType<AckRequest>;

/** How long a pull may wait and how much it may take, within what the service's settings allow. */
export const pullQuerySchema = (limits: { maxWaitMs: number; maxEventsPerPull: number }) =>
  z.strictObject({
    waitMs: z.coerce.number().int().min(0).max(limits.maxWaitMs).default(0),
    max: z.coerce
      .number()
      .int()
      .min(1)
      .max(limits.maxEventsPerPull)
      .default(limits.maxEventsPerPull),
  });
export type PullQuery = z.infer<ReturnType<typeof pullQuerySchema>>;
