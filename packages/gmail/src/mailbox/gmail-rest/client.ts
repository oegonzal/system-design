import {
  googleRequest,
  GoogleRefused,
  type GoogleCall,
  type TokenSource,
} from '@sysdesign/google-kit';
import { NO_RECOVERY, type Recovery } from '@sysdesign/contracts';

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
} from '../ports';
import { addressesOf, headerOf, snippetOf, textOf } from './mime';
import { rawMessage, replySubject } from './rfc822';
import {
  draftListSchema,
  draftSchema,
  historySchema,
  labelListSchema,
  messageSchema,
  modifiedMessageSchema,
  modifiedThreadSchema,
  profileSchema,
  threadListSchema,
  threadSchema,
  type MessageWire,
} from './schemas';

export const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** The headers a metadata read asks for: enough to list a message without its body. */
const METADATA_HEADERS = ['From', 'To', 'Subject', 'Date', 'Message-ID', 'References'];

/** How many history pages one poll walks before answering what it has; the rest waits for the next. */
const HISTORY_PAGES = 50;

const dateOf = (message: MessageWire): string => {
  const header = headerOf(message.payload?.headers, 'Date');
  if (header !== null) {
    const parsed = Date.parse(header);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return message.internalDate === undefined
    ? ''
    : new Date(Number(message.internalDate)).toISOString();
};

/** The Gmail REST API as the mailbox port: every call authorized, every answer read by its schema. */
export class GmailRest implements MailboxPort {
  private labelsByName: Map<string, Label> | null = null;

  constructor(
    private readonly auth: TokenSource,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly recovery: Recovery = NO_RECOVERY,
  ) {}

  private call<T>(call: GoogleCall<T>): Promise<T> {
    return googleRequest(this.auth, call, this.fetchImpl, this.recovery);
  }

  /** A read that Google answered notFound is null; any other refusal stands. */
  private async found<T>(call: GoogleCall<T>): Promise<T | null> {
    try {
      return await this.call(call);
    } catch (error) {
      if (error instanceof GoogleRefused && error.status === 404) return null;
      throw error;
    }
  }

  private metadata(
    message: MessageWire,
  ): Omit<MessageDetail, 'body' | 'messageIdHeader' | 'references'> {
    const headers = message.payload?.headers;
    return {
      id: message.id,
      threadId: message.threadId,
      from: headerOf(headers, 'From') ?? '',
      to: addressesOf(headerOf(headers, 'To')),
      subject: headerOf(headers, 'Subject') ?? '',
      date: dateOf(message),
      snippet: snippetOf(message.snippet),
      labels: message.labelIds ?? [],
    };
  }

  private detail(message: MessageWire): MessageDetail {
    const headers = message.payload?.headers;
    return {
      ...this.metadata(message),
      body: textOf(message.payload),
      messageIdHeader: headerOf(headers, 'Message-ID'),
      references: headerOf(headers, 'References'),
    };
  }

  async searchThreads(query: string, max: number): Promise<ThreadSummary[]> {
    const listed = await this.call({
      method: 'GET',
      url: `${GMAIL_API}/threads`,
      query: { q: query, maxResults: max },
      schema: threadListSchema,
    });
    const summaries: ThreadSummary[] = [];
    for (const { id, snippet } of listed.threads ?? []) {
      const thread = await this.found({
        method: 'GET',
        url: `${GMAIL_API}/threads/${encodeURIComponent(id)}`,
        query: { format: 'metadata', metadataHeaders: METADATA_HEADERS },
        schema: threadSchema,
      });
      const messages = (thread?.messages ?? []).map((message) => this.metadata(message));
      const latest = messages.at(-1);
      summaries.push({
        id,
        subject: messages[0]?.subject ?? '',
        from: latest?.from ?? '',
        messages: messages.length,
        date: latest?.date ?? '',
        snippet: snippetOf(snippet),
      });
    }
    return summaries;
  }

  async getMessage(id: string): Promise<MessageDetail | null> {
    const message = await this.found({
      method: 'GET',
      url: `${GMAIL_API}/messages/${encodeURIComponent(id)}`,
      query: { format: 'full' },
      schema: messageSchema,
    });
    return message === null ? null : this.named(this.detail(message));
  }

  async getThread(id: string): Promise<ThreadDetail | null> {
    const thread = await this.found({
      method: 'GET',
      url: `${GMAIL_API}/threads/${encodeURIComponent(id)}`,
      query: { format: 'full' },
      schema: threadSchema,
    });
    if (thread === null) return null;
    return {
      id: thread.id,
      messages: await Promise.all(
        (thread.messages ?? []).map((message) => this.named(this.detail(message))),
      ),
    };
  }

  /** A message with its labels as names, the way the port promises them and a plan copies them into a label call. */
  private async named(message: MessageDetail): Promise<MessageDetail> {
    return { ...message, labels: await this.names(message.labels) };
  }

  async createDraft(draft: DraftRequest): Promise<DraftSummary> {
    const replied =
      draft.replyToMessageId === null ? null : await this.getMessage(draft.replyToMessageId);
    if (draft.replyToMessageId !== null && replied === null) {
      throw new GoogleRefused(
        404,
        'notFound',
        `no message ${draft.replyToMessageId} to reply to`,
        'POST /drafts',
      );
    }
    const to = draft.to.length === 0 && replied !== null ? [replied.from] : draft.to;
    const subject =
      replied === null ? draft.subject : draft.subject || replySubject(replied.subject);
    const raw = rawMessage({
      to,
      cc: draft.cc,
      subject,
      body: draft.body,
      inReplyTo: replied?.messageIdHeader ?? null,
      references: replied?.references ?? null,
    });
    const created = await this.call({
      method: 'POST',
      url: `${GMAIL_API}/drafts`,
      body: { message: { raw, ...(replied === null ? {} : { threadId: replied.threadId }) } },
      schema: draftSchema,
    });
    return {
      id: created.id,
      messageId: created.message.id,
      threadId: created.message.threadId ?? replied?.threadId ?? null,
      to,
      subject,
    };
  }

  async listDrafts(max: number): Promise<DraftSummary[]> {
    const listed = await this.call({
      method: 'GET',
      url: `${GMAIL_API}/drafts`,
      query: { maxResults: max },
      schema: draftListSchema,
    });
    const drafts: DraftSummary[] = [];
    for (const { id } of listed.drafts ?? []) {
      const draft = await this.found({
        method: 'GET',
        url: `${GMAIL_API}/drafts/${encodeURIComponent(id)}`,
        query: { format: 'metadata' },
        schema: draftSchema,
      });
      if (draft === null) continue;
      const headers = draft.message.payload?.headers;
      drafts.push({
        id: draft.id,
        messageId: draft.message.id,
        threadId: draft.message.threadId ?? null,
        to: addressesOf(headerOf(headers, 'To')),
        subject: headerOf(headers, 'Subject') ?? '',
      });
    }
    return drafts;
  }

  async listLabels(): Promise<Label[]> {
    const listed = await this.call({
      method: 'GET',
      url: `${GMAIL_API}/labels`,
      schema: labelListSchema,
    });
    const labels = listed.labels.map((label): Label => ({
      id: label.id,
      name: label.name,
      type: label.type === 'user' ? 'user' : 'system',
    }));
    this.labelsByName = new Map(labels.map((label) => [label.name.toLowerCase(), label]));
    return labels;
  }

  /** Label names to ids, by the list read once and read again for a name it does not hold. */
  private async labelIds(names: readonly string[]): Promise<string[]> {
    if (names.length === 0) return [];
    if (this.labelsByName === null) await this.listLabels();
    const missing = names.filter((name) => !this.labelsByName?.has(name.toLowerCase()));
    if (missing.length > 0) await this.listLabels();
    return names.map((name) => {
      const label = this.labelsByName?.get(name.toLowerCase());
      if (label === undefined) throw new LabelUnknown(name);
      return label.id;
    });
  }

  /** Label ids as names, by the list read once; an id the list does not hold is read for again, then kept as it is. */
  private async names(ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    if (this.labelsByName === null) await this.listLabels();
    let names = this.labelNames(ids);
    if (names.includes(null)) {
      await this.listLabels();
      names = this.labelNames(ids);
    }
    return names.map((name, position) => name ?? (ids[position] as string));
  }

  private labelNames(ids: readonly string[]): (string | null)[] {
    const byId = new Map(
      [...(this.labelsByName?.values() ?? [])].map((label) => [label.id, label.name]),
    );
    return ids.map((id) => byId.get(id) ?? null);
  }

  async modifyLabels(
    target: 'message' | 'thread',
    id: string,
    add: string[],
    remove: string[],
  ): Promise<string[]> {
    const body = {
      addLabelIds: await this.labelIds(add),
      removeLabelIds: await this.labelIds(remove),
    };
    const url = `${GMAIL_API}/${target === 'message' ? 'messages' : 'threads'}/${encodeURIComponent(id)}/modify`;
    if (target === 'message') {
      const modified = await this.call({
        method: 'POST',
        url,
        body,
        schema: modifiedMessageSchema,
      });
      return this.names(modified.labelIds ?? []);
    }
    const modified = await this.call({ method: 'POST', url, body, schema: modifiedThreadSchema });
    const ids = new Set((modified.messages ?? []).flatMap((message) => message.labelIds ?? []));
    return this.names([...ids]);
  }

  profile(): Promise<Profile> {
    return this.call({ method: 'GET', url: `${GMAIL_API}/profile`, schema: profileSchema });
  }

  /**
   * The messages added since the history id, and where to continue from:
   * the mailbox's own history id once every page is read, else — the walk
   * cut at the declared page count with pages left — the last record read,
   * so the next poll continues from there and no page is skipped.
   */
  async history(startHistoryId: string): Promise<HistoryPage | null> {
    const added: string[] = [];
    let lastRecord: string | null = null;
    let pageToken: string | undefined;
    for (let pages = 0; pages < HISTORY_PAGES; pages += 1) {
      const page = await this.found({
        method: 'GET',
        url: `${GMAIL_API}/history`,
        query: {
          startHistoryId,
          historyTypes: 'messageAdded',
          labelId: 'INBOX',
          maxResults: 100,
          pageToken,
        },
        schema: historySchema,
      });
      if (page === null) return null;
      for (const entry of page.history ?? []) {
        lastRecord = entry.id;
        for (const { message } of entry.messagesAdded ?? []) {
          if (!added.includes(message.id)) added.push(message.id);
        }
      }
      pageToken = page.nextPageToken;
      if (pageToken === undefined) return { messagesAdded: added, historyId: page.historyId };
    }
    return { messagesAdded: added, historyId: lastRecord ?? startHistoryId };
  }
}
