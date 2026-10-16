/**
 * What the mailbox service says happened: a message arrived, a draft was
 * written, labels changed. Declared on the bus beside the tool-session
 * topics it also publishes.
 */
import { z } from 'zod';

export const GMAIL_TOPICS = {
  messageReceived: 'gmail.message.received',
  draftCreated: 'gmail.draft.created',
  labelsChanged: 'gmail.labels.changed',
} as const;

const ID_MAX_LENGTH = 200;
const HEADER_MAX_LENGTH = 1_000;

const id = z.string().min(1).max(ID_MAX_LENGTH);
const header = z.string().max(HEADER_MAX_LENGTH);

/** A message the watcher found newly in the inbox, not sent by the account itself. */
export const gmailMessageReceivedSchema = z.strictObject({
  messageId: id,
  threadId: id,
  from: header,
  subject: header,
  receivedAt: z.iso.datetime(),
});

/** A draft the service wrote; nothing is sent. */
export const gmailDraftCreatedSchema = z.strictObject({
  draftId: id,
  messageId: id,
  threadId: id.nullable(),
  to: z.array(header),
  subject: header,
});

/** Labels put on or taken off one message or one thread, by name as the mailbox shows them. */
export const gmailLabelsChangedSchema = z.strictObject({
  target: z.enum(['message', 'thread']),
  id,
  added: z.array(header),
  removed: z.array(header),
});
