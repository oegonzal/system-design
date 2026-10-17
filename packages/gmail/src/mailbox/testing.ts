/**
 * The mailbox in memory, for the specs: threads, messages, drafts and
 * labels as plain records, a history that counts what was added. Pure — no
 * vitest import.
 */
import {
  LabelUnknown,
  type DraftRequest,
  type DraftSummary,
  type HistoryPage,
  type Label,
  type MailboxPort,
  type MessageDetail,
  type Profile,
  type ThreadDetail,
  type ThreadSummary,
} from './ports';

export const SYSTEM_LABELS: Label[] = [
  { id: 'INBOX', name: 'INBOX', type: 'system' },
  { id: 'UNREAD', name: 'UNREAD', type: 'system' },
  { id: 'STARRED', name: 'STARRED', type: 'system' },
  { id: 'SENT', name: 'SENT', type: 'system' },
];

let minted = 0;
const mint = (prefix: string): string => `${prefix}${++minted}`;

export const sampleMessage = (overrides: Partial<MessageDetail> = {}): MessageDetail => ({
  id: mint('m'),
  threadId: 't1',
  from: 'Ada Example <ada@example.test>',
  to: ['owner@example.test'],
  subject: 'Lunch next week?',
  date: '2026-10-15T09:00:00.000Z',
  snippet: 'Would Tuesday or Thursday work for you?',
  labels: ['INBOX', 'UNREAD'],
  body: 'Hi,\n\nWould Tuesday or Thursday work for you?\n\nAda',
  messageIdHeader: '<m1@example.test>',
  references: null,
  ...overrides,
});

export class InMemoryMailbox implements MailboxPort {
  readonly messages: MessageDetail[] = [];
  readonly drafts: DraftSummary[] = [];
  /** What each draft says, by its id. */
  readonly draftBodies = new Map<string, string>();
  readonly labels: Label[] = [...SYSTEM_LABELS, { id: 'Label_1', name: 'Clients', type: 'user' }];
  readonly added: string[] = [];
  /** The history ids the mailbox will not answer from: a poll since one of them reads as stale. */
  readonly staleHistoryIds = new Set<string>();
  readonly address = 'owner@example.test';
  private historyId = 100;

  constructor(messages: MessageDetail[] = []) {
    for (const message of messages) this.messages.push(message);
  }

  /** A message arriving: added, and counted in the history. */
  receive(message: MessageDetail): void {
    this.messages.push(message);
    this.added.push(message.id);
    this.historyId += 1;
  }

  searchThreads(query: string, max: number): Promise<ThreadSummary[]> {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word !== '' && !word.includes(':'));
    const threads = new Map<string, MessageDetail[]>();
    for (const message of this.messages) {
      const text = `${message.subject} ${message.from} ${message.body}`.toLowerCase();
      if (words.every((word) => text.includes(word))) {
        threads.set(message.threadId, [...(threads.get(message.threadId) ?? []), message]);
      }
    }
    return Promise.resolve(
      [...threads.entries()].slice(0, max).map(([id, messages]) => {
        const latest = messages[messages.length - 1] as MessageDetail;
        return {
          id,
          subject: messages[0]?.subject ?? '',
          from: latest.from,
          messages: messages.length,
          date: latest.date,
          snippet: latest.snippet,
        };
      }),
    );
  }

  getMessage(id: string): Promise<MessageDetail | null> {
    return Promise.resolve(this.messages.find((message) => message.id === id) ?? null);
  }

  getThread(id: string): Promise<ThreadDetail | null> {
    const messages = this.messages.filter((message) => message.threadId === id);
    return Promise.resolve(messages.length === 0 ? null : { id, messages });
  }

  createDraft(draft: DraftRequest): Promise<DraftSummary> {
    const replied =
      draft.replyToMessageId === null
        ? null
        : (this.messages.find((message) => message.id === draft.replyToMessageId) ?? null);
    if (draft.replyToMessageId !== null && replied === null) {
      return Promise.reject(new Error(`no message ${draft.replyToMessageId}`));
    }
    const summary: DraftSummary = {
      id: mint('d'),
      messageId: mint('dm'),
      threadId: replied?.threadId ?? null,
      to: draft.to.length === 0 && replied !== null ? [replied.from] : draft.to,
      subject: draft.subject || (replied === null ? '' : `Re: ${replied.subject}`),
    };
    this.drafts.push(summary);
    this.draftBodies.set(summary.id, draft.body);
    return Promise.resolve(summary);
  }

  listDrafts(max: number): Promise<DraftSummary[]> {
    return Promise.resolve(this.drafts.slice(0, max));
  }

  listLabels(): Promise<Label[]> {
    return Promise.resolve([...this.labels]);
  }

  modifyLabels(
    target: 'message' | 'thread',
    id: string,
    add: string[],
    remove: string[],
  ): Promise<string[]> {
    for (const name of [...add, ...remove]) {
      if (!this.labels.some((label) => label.name.toLowerCase() === name.toLowerCase())) {
        return Promise.reject(new LabelUnknown(name));
      }
    }
    const targets = this.messages.filter((message) =>
      target === 'message' ? message.id === id : message.threadId === id,
    );
    if (targets.length === 0) return Promise.reject(new Error(`no ${target} ${id}`));
    const names = (list: string[]): string[] =>
      list.map(
        (name) =>
          this.labels.find((label) => label.name.toLowerCase() === name.toLowerCase())?.name ??
          name,
      );
    for (const message of targets) {
      message.labels = [...new Set([...message.labels, ...names(add)])].filter(
        (label) => !names(remove).includes(label),
      );
    }
    return Promise.resolve([...new Set(targets.flatMap((message) => message.labels))]);
  }

  profile(): Promise<Profile> {
    return Promise.resolve({ emailAddress: this.address, historyId: String(this.historyId) });
  }

  history(startHistoryId: string): Promise<HistoryPage | null> {
    if (this.staleHistoryIds.has(startHistoryId)) return Promise.resolve(null);
    const since = Number(startHistoryId);
    const count = Math.max(0, Math.min(this.added.length, this.historyId - since));
    return Promise.resolve({
      messagesAdded: this.added.slice(this.added.length - count),
      historyId: String(this.historyId),
    });
  }
}
