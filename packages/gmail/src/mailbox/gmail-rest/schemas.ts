/**
 * What the Gmail API answers, read for the fields the adapter uses and no
 * more: loose objects, since Google answers more than any reader needs.
 */
import { z } from 'zod';

const header = z.object({ name: z.string(), value: z.string() });

const part: z.ZodType<MimePartWire> = z.lazy(() =>
  z.object({
    mimeType: z.string().optional(),
    body: z.object({ data: z.string().optional(), size: z.number().optional() }).optional(),
    parts: z.array(part).optional(),
    headers: z.array(header).optional(),
  }),
);

export interface MimePartWire {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: MimePartWire[];
  headers?: { name: string; value: string }[];
}

export const messageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).optional(),
  snippet: z.string().optional(),
  /** Milliseconds since the epoch, as decimal text. */
  internalDate: z.string().optional(),
  payload: part.optional(),
});
export type MessageWire = z.infer<typeof messageSchema>;

export const threadSchema = z.object({
  id: z.string(),
  messages: z.array(messageSchema).optional(),
});

export const threadListSchema = z.object({
  threads: z.array(z.object({ id: z.string(), snippet: z.string().optional() })).optional(),
});

export const draftSchema = z.object({
  id: z.string(),
  message: z
    .object({ id: z.string(), threadId: z.string().optional() })
    .merge(z.object({ payload: part.optional() })),
});

export const draftListSchema = z.object({
  drafts: z.array(z.object({ id: z.string() })).optional(),
});

export const labelListSchema = z.object({
  labels: z.array(z.object({ id: z.string(), name: z.string(), type: z.string().optional() })),
});

export const modifiedMessageSchema = z.object({ labelIds: z.array(z.string()).optional() });
export const modifiedThreadSchema = z.object({
  messages: z.array(z.object({ labelIds: z.array(z.string()).optional() })).optional(),
});

export const profileSchema = z.object({ emailAddress: z.string(), historyId: z.string() });

export const historySchema = z.object({
  history: z
    .array(
      z.object({
        messagesAdded: z
          .array(
            z.object({
              message: z.object({ id: z.string(), labelIds: z.array(z.string()).optional() }),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  historyId: z.string(),
  nextPageToken: z.string().optional(),
});
