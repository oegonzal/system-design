import { z } from 'zod';

/**
 * The parts of the Telegram Bot API the channel reads, as Telegram documents
 * them (core.telegram.org/bots/api). Loose objects: Telegram adds fields, and
 * a field the channel never reads must never refuse an update.
 */
const chatSchema = z.looseObject({ id: z.number() });

const messageSchema = z.looseObject({
  message_id: z.number(),
  chat: chatSchema,
  text: z.string().optional(),
  reply_to_message: z.looseObject({ message_id: z.number() }).optional(),
});

const callbackQuerySchema = z.looseObject({
  id: z.string(),
  message: z.looseObject({ message_id: z.number(), chat: chatSchema }).optional(),
  data: z.string().optional(),
});

export const updateSchema = z.looseObject({
  update_id: z.number(),
  message: messageSchema.optional(),
  callback_query: callbackQuerySchema.optional(),
});
export type Update = z.infer<typeof updateSchema>;

export const botSchema = z.looseObject({ username: z.string() });

export const sentSchema = z.looseObject({ message_id: z.number() });

/** What a call that returns nothing of its own answers. */
export const doneSchema = z.literal(true);

/** Every Bot API answer: its result, or why not — and, for a rate limit, how long to wait. */
export const apiResponseSchema = z.union([
  z.looseObject({ ok: z.literal(true), result: z.unknown() }),
  z.looseObject({
    ok: z.literal(false),
    error_code: z.number(),
    description: z.string(),
    parameters: z.looseObject({ retry_after: z.number().optional() }).optional(),
  }),
]);
