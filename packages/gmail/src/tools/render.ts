import { excerpt } from '@sysdesign/contracts';

import type { DraftSummary, Label, MessageDetail, ThreadDetail, ThreadSummary } from '../mailbox';

/**
 * What a tool answers in words: the summary a plan reads. Every line names
 * the ids a later call takes, so a plan never has to guess one.
 */
const when = (date: string): string =>
  date === '' ? 'undated' : date.slice(0, 16).replace('T', ' ');

export const threadLines = (threads: readonly ThreadSummary[]): string =>
  threads.length === 0
    ? 'No thread matches.'
    : threads
        .map(
          (thread) =>
            `- thread ${thread.id} · ${when(thread.date)} · ${thread.from} · ${JSON.stringify(thread.subject)} · ${thread.messages} message${thread.messages === 1 ? '' : 's'}${thread.snippet === '' ? '' : ` · ${thread.snippet}`}`,
        )
        .join('\n');

const header = (message: MessageDetail): string =>
  [
    `message ${message.id} · thread ${message.threadId}`,
    `From: ${message.from}`,
    `To: ${message.to.join(', ')}`,
    `Date: ${message.date}`,
    `Subject: ${message.subject}`,
    `Labels: ${message.labels.join(', ') || 'none'}`,
  ].join('\n');

export const messageText = (message: MessageDetail, bodyMaxLength: number): string =>
  `${header(message)}\n\n${excerpt(message.body, bodyMaxLength) || '(no text)'}`;

export const threadText = (thread: ThreadDetail, messageMaxLength: number): string =>
  [
    `thread ${thread.id} · ${thread.messages.length} message${thread.messages.length === 1 ? '' : 's'}`,
    ...thread.messages.map(
      (message) =>
        `\n--- message ${message.id} · ${when(message.date)} · ${message.from} · ${JSON.stringify(message.subject)}\n${excerpt(message.body, messageMaxLength) || '(no text)'}`,
    ),
  ].join('\n');

export const draftLine = (draft: DraftSummary): string =>
  `- draft ${draft.id} · to ${draft.to.join(', ') || 'nobody'} · ${JSON.stringify(draft.subject)}${draft.threadId === null ? '' : ` · in thread ${draft.threadId}`}`;

export const draftLines = (drafts: readonly DraftSummary[]): string =>
  drafts.length === 0 ? 'No drafts.' : drafts.map(draftLine).join('\n');

export const labelLines = (labels: readonly Label[]): string =>
  labels.map((label) => `- ${label.name} (${label.type})`).join('\n');
