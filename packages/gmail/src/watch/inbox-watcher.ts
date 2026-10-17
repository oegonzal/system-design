import {
  GMAIL_SOURCE,
  GMAIL_TOPICS,
  INTERACTION_TOPICS,
  type InteractionPrompt,
} from '@sysdesign/contracts';
import { notedPrompt, type BusClient } from '@sysdesign/notifications-client';

import type { MailboxPort, MessageDetail } from '../mailbox';
import type { WatchSettings } from '../settings';

/**
 * What arrives in the inbox, told once: the watcher reads the mailbox's
 * history since where it stood when the service started, says each new
 * message on the bus, and tells the person of each poll's arrivals in one
 * notice. A history too old for the mailbox to answer from resets the
 * watcher to now, and nothing is told twice. Nothing the account sent
 * itself is an arrival.
 */
export interface WatchLog {
  info(line: string): void;
  warn(line: string): void;
}

/** Where the watcher stands: the history id it will read from next, and the account whose own mail it passes over. */
export interface WatchCursor {
  historyId: string;
  address: string;
}

export class InboxWatcher {
  private cursor: WatchCursor | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly mailbox: MailboxPort,
    private readonly bus: Pick<BusClient, 'publish'>,
    private readonly settings: WatchSettings,
    private readonly log: WatchLog,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Starts from where the mailbox stands now: nothing older is told. */
  async start(): Promise<void> {
    if (!this.settings.enabled) return;
    await this.reset();
    this.timer = setInterval(() => {
      void this.poll().catch((error: unknown) => {
        this.log.warn(`inbox watch: ${String(error)}`);
      });
    }, this.settings.pollEveryMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private async reset(): Promise<void> {
    const profile = await this.mailbox.profile();
    this.cursor = { historyId: profile.historyId, address: profile.emailAddress.toLowerCase() };
    this.log.info(`inbox watch: from history ${profile.historyId} as ${profile.emailAddress}`);
  }

  /** One poll: the arrivals since the cursor, each said on the bus, all told in one notice. */
  async poll(): Promise<MessageDetail[]> {
    if (this.cursor === null) await this.reset();
    const cursor = this.cursor as WatchCursor;
    const page = await this.mailbox.history(cursor.historyId);
    if (page === null) {
      this.log.warn(
        `inbox watch: history ${cursor.historyId} is too old to read from; starting again from now`,
      );
      await this.reset();
      return [];
    }
    cursor.historyId = page.historyId;
    const arrivals: MessageDetail[] = [];
    for (const id of page.messagesAdded) {
      const message = await this.mailbox.getMessage(id);
      if (message === null || message.from.toLowerCase().includes(cursor.address)) continue;
      arrivals.push(message);
      await this.bus.publish({
        topic: GMAIL_TOPICS.messageReceived,
        source: GMAIL_SOURCE,
        payload: {
          messageId: message.id,
          threadId: message.threadId,
          from: message.from,
          subject: message.subject,
          receivedAt: message.date === '' ? this.clock().toISOString() : message.date,
        },
      });
    }
    if (arrivals.length > 0) {
      await this.bus.publish({
        topic: INTERACTION_TOPICS.prompted,
        source: GMAIL_SOURCE,
        payload: this.notice(arrivals),
      });
    }
    return arrivals;
  }

  private notice(arrivals: readonly MessageDetail[]): InteractionPrompt {
    const now = this.clock();
    return notedPrompt({
      origin: { kind: 'inbox-watch', id: this.cursor?.address ?? GMAIL_SOURCE, label: 'new mail' },
      title: `${arrivals.length} new message${arrivals.length === 1 ? '' : 's'}`,
      details: arrivals.map(
        (message) =>
          `${message.from} — ${message.subject || '(no subject)'} (message ${message.id})`,
      ),
      expiresAt: new Date(now.getTime() + this.settings.noticeTtlMs),
    });
  }
}
