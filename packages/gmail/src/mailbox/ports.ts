/**
 * The mailbox as the tools and the watcher reach it: what a thread, a
 * message, a draft and a label are to them, and the one port an adapter
 * fills. Nothing here knows HTTP; the Gmail REST adapter is one filling, the
 * in-memory mailbox the specs' is another.
 */
export interface MessageSummary {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  /** When it was sent, as the message's own Date header says, or the mailbox's internal date when it has none. */
  date: string;
  snippet: string;
  /** Label names, as the mailbox shows them. */
  labels: string[];
}

export interface MessageDetail extends MessageSummary {
  /** The message's text: its plain part, or its HTML reduced to text when it has none. */
  body: string;
  /** The `Message-ID` header, which a reply refers to; null when the message carries none. */
  messageIdHeader: string | null;
  /** The `References` header, which a reply extends; null when the message carries none. */
  references: string | null;
}

export interface ThreadSummary {
  id: string;
  subject: string;
  /** Who wrote the thread's latest message. */
  from: string;
  messages: number;
  /** When the latest message was sent. */
  date: string;
  snippet: string;
}

export interface ThreadDetail {
  id: string;
  messages: MessageDetail[];
}

export interface DraftRequest {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  /** The message the draft replies to; the draft then joins its thread and refers to it. */
  replyToMessageId: string | null;
}

export interface DraftSummary {
  id: string;
  messageId: string;
  threadId: string | null;
  to: string[];
  subject: string;
}

export interface Label {
  id: string;
  name: string;
  type: 'system' | 'user';
}

export interface Profile {
  emailAddress: string;
  historyId: string;
}

/** What changed since a history id: the ids of the messages added to the inbox, and where the history now stands. */
export interface HistoryPage {
  messagesAdded: string[];
  historyId: string;
}

/** A label named that the mailbox does not have. */
export class LabelUnknown extends Error {
  override readonly name = 'LabelUnknown';
  constructor(readonly label: string) {
    super(`no label ${JSON.stringify(label)}`);
  }
}

export const MAILBOX = Symbol('MAILBOX');

export interface MailboxPort {
  searchThreads(query: string, max: number): Promise<ThreadSummary[]>;
  /** Null for a message the mailbox does not have. */
  getMessage(id: string): Promise<MessageDetail | null>;
  getThread(id: string): Promise<ThreadDetail | null>;
  createDraft(draft: DraftRequest): Promise<DraftSummary>;
  listDrafts(max: number): Promise<DraftSummary[]>;
  listLabels(): Promise<Label[]>;
  /** Labels by name put on or taken off one message or one thread; answers the names it then carries. Throws `LabelUnknown`. */
  modifyLabels(
    target: 'message' | 'thread',
    id: string,
    add: string[],
    remove: string[],
  ): Promise<string[]>;
  profile(): Promise<Profile>;
  /** The inbox's additions since a history id; null when the id is too old for the mailbox to answer from. */
  history(startHistoryId: string): Promise<HistoryPage | null>;
}
