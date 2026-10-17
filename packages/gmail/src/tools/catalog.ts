import { GMAIL_SOURCE, GMAIL_TOPICS } from '@sysdesign/contracts';
import {
  defineTool,
  type RunnableTool,
  type SessionEventsPort,
  type ToolSpec,
} from '@sysdesign/tool-session';
import { z } from 'zod';

import { LabelUnknown, type MailboxPort } from '../mailbox';
import type { MailboxSettings } from '../settings';
import { draftLine, draftLines, labelLines, messageText, threadLines, threadText } from './render';

/**
 * The mailbox's tools, declared once: each a name, what it does, its
 * parameters, its effect and what it answers. None sends: a draft is the
 * most a session may write, and it stays a draft until a person sends it.
 * No tool asks the operator first — nothing here reaches anyone — so a
 * session runs them as the loop allows.
 */
const id = z.string().min(1).describe('An id exactly as an earlier result listed it.');
const label = z.string().min(1).describe('A label name as list_labels lists it.');
const address = z.string().min(1);

export function gmailTools(
  mailbox: MailboxPort,
  settings: MailboxSettings,
  events: SessionEventsPort,
): RunnableTool[] {
  const tool = <P extends z.ZodObject>(spec: ToolSpec<P>): RunnableTool =>
    defineTool(spec, GMAIL_SOURCE);

  const relabel = async (
    target: 'message' | 'thread',
    target_id: string,
    add: string[],
    remove: string[],
  ) => {
    try {
      const labels = await mailbox.modifyLabels(target, target_id, add, remove);
      await events.publish(GMAIL_TOPICS.labelsChanged, {
        target,
        id: target_id,
        added: add,
        removed: remove,
      });
      return {
        outcome: 'ok' as const,
        summary: `${target} ${target_id} now carries: ${labels.join(', ') || 'no label'}`,
        data: { labels },
      };
    } catch (error) {
      if (error instanceof LabelUnknown) {
        return {
          outcome: 'refused' as const,
          summary: `${error.message}: list_labels names the labels there are`,
          data: null,
        };
      }
      throw error;
    }
  };

  return [
    tool({
      name: 'search_threads',
      description:
        'Finds threads with Gmail search operators (from:, to:, subject:, newer_than:7d, is:unread, label:…) and lists each with its id, latest sender, subject and message count.',
      parameters: z.object({
        query: z.string().min(1).describe('The search, in Gmail search syntax.'),
        max: z
          .number()
          .int()
          .min(1)
          .max(settings.searchCeiling)
          .nullable()
          .describe(`At most this many threads; null for ${settings.searchMax}.`),
      }),
      effect: 'read',
      approval: false,
      run: async ({ query, max }) => {
        const threads = await mailbox.searchThreads(query, max ?? settings.searchMax);
        return { outcome: 'ok', summary: threadLines(threads), data: threads };
      },
    }),
    tool({
      name: 'get_message',
      description: 'Reads one message whole: its headers, labels and text.',
      parameters: z.object({ id }),
      effect: 'read',
      approval: false,
      run: async ({ id: messageId }) => {
        const message = await mailbox.getMessage(messageId);
        if (message === null)
          return { outcome: 'refused', summary: `no message ${messageId}`, data: null };
        return {
          outcome: 'ok',
          summary: messageText(message, settings.bodyMaxLength),
          data: message,
        };
      },
    }),
    tool({
      name: 'get_thread',
      description:
        'Reads one thread whole: every message in order, each with who wrote it and what it says.',
      parameters: z.object({ id }),
      effect: 'read',
      approval: false,
      run: async ({ id: threadId }) => {
        const thread = await mailbox.getThread(threadId);
        if (thread === null)
          return { outcome: 'refused', summary: `no thread ${threadId}`, data: null };
        return {
          outcome: 'ok',
          summary: threadText(thread, settings.messageInThreadMaxLength),
          data: thread,
        };
      },
    }),
    tool({
      name: 'create_draft',
      description:
        'Writes a draft — never sends it. A reply names the message it answers by replyToMessageId and joins its thread; its recipients and subject then default to the original’s.',
      parameters: z.object({
        to: z
          .array(address)
          .describe('Recipients; empty for a reply to default to the original sender.'),
        cc: z.array(address),
        subject: z.string().describe('Empty for a reply to default to "Re: <original subject>".'),
        body: z.string().min(1),
        replyToMessageId: id
          .nullable()
          .describe('The message this replies to, or null for a new thread.'),
      }),
      effect: 'write',
      approval: false,
      run: async (draft) => {
        if (draft.replyToMessageId === null && draft.to.length === 0) {
          return {
            outcome: 'refused',
            summary: 'a new draft needs at least one recipient',
            data: null,
          };
        }
        const created = await mailbox.createDraft(draft);
        await events.publish(GMAIL_TOPICS.draftCreated, {
          draftId: created.id,
          messageId: created.messageId,
          threadId: created.threadId,
          to: created.to,
          subject: created.subject,
        });
        return {
          outcome: 'ok',
          summary: `Drafted, not sent: ${draftLine(created).slice(2)}`,
          data: created,
        };
      },
    }),
    tool({
      name: 'list_drafts',
      description: 'Lists the drafts waiting to be sent, each with its id, recipients and subject.',
      parameters: z.object({
        max: z
          .number()
          .int()
          .min(1)
          .max(settings.searchCeiling)
          .nullable()
          .describe(`At most this many; null for ${settings.searchMax}.`),
      }),
      effect: 'read',
      approval: false,
      run: async ({ max }) => {
        const drafts = await mailbox.listDrafts(max ?? settings.searchMax);
        return { outcome: 'ok', summary: draftLines(drafts), data: drafts };
      },
    }),
    tool({
      name: 'list_labels',
      description: 'Lists every label, system and user-made, by name.',
      parameters: z.object({}),
      effect: 'read',
      approval: false,
      run: async () => {
        const labels = await mailbox.listLabels();
        return { outcome: 'ok', summary: labelLines(labels), data: labels };
      },
    }),
    tool({
      name: 'label_message',
      description: 'Puts a label on one message.',
      parameters: z.object({ id, label }),
      effect: 'write',
      approval: false,
      run: ({ id: messageId, label: name }) => relabel('message', messageId, [name], []),
    }),
    tool({
      name: 'label_thread',
      description: 'Puts a label on every message of one thread.',
      parameters: z.object({ id, label }),
      effect: 'write',
      approval: false,
      run: ({ id: threadId, label: name }) => relabel('thread', threadId, [name], []),
    }),
    tool({
      name: 'unlabel_message',
      description: 'Takes a label off one message.',
      parameters: z.object({ id, label }),
      effect: 'write',
      approval: false,
      run: ({ id: messageId, label: name }) => relabel('message', messageId, [], [name]),
    }),
    tool({
      name: 'unlabel_thread',
      description: 'Takes a label off every message of one thread.',
      parameters: z.object({ id, label }),
      effect: 'write',
      approval: false,
      run: ({ id: threadId, label: name }) => relabel('thread', threadId, [], [name]),
    }),
  ];
}
