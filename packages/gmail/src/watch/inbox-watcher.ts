import {
  GMAIL_SOURCE,
  GMAIL_TOPICS,
  INTERACTION_TOPICS,
  ToldOnce,
  type InteractionPrompt,
} from '@sysdesign/contracts';
import { notedPrompt, type BusClient } from '@sysdesign/notifications-client';

import { addressOf, type MailboxPort, type MessageDetail } from '../mailbox';
import type { WatchSettings } from '../settings';

/**
 * What arrives in the inbox, told once: the watcher reads the mailbox's
 * history since where it stood when the service started, says each new
 * message on the bus, and tells the person of each poll's arrivals in one
 * notice. One poll runs at a time; the cursor moves only once everything is
 * told, so a poll that failed midway starts again from the same place and
 * what it had told is remembered and passed over. A history too old for the
 * mailbox to answer from resets the watcher to now. Nothing the account sent
 * itself is an arrival: the mailbox marks what it sent, and a message from
 * the account's own address is its own.
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

/** The label the mailbox puts on what the account sent. */
const SENT_LABEL = 'SENT';

/** How many tellings are remembered against a retried poll. */
const TOLD_KEEP = 1_000;

export class InboxWatcher {
  private cursor: WatchCursor | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<MessageDetail[]> | null = null;
  private readonly told = new ToldOnce(TOLD_KEEP);

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

  /** One poll at a time: a tick that lands while one runs joins it. */
  poll(): Promise<MessageDetail[]> {
    if (this.inFlight === null) {
      this.inFlight = this.pollOnce().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  private async reset(): Promise<void> {
    const profile = await this.mailbox.profile();
    this.cursor = { historyId: profile.historyId, address: profile.emailAddress.toLowerCase() };
    this.log.info(`inbox watch: from history ${profile.historyId} as ${profile.emailAddress}`);
  }

  private ownMail(message: MessageDetail, cursor: WatchCursor): boolean {
    return message.labels.includes(SENT_LABEL) || addressOf(message.from) === cursor.address;
  }

  /** The arrivals since the cursor, each said on the bus, all told in one notice, then the cursor moved. */
  private async pollOnce(): Promise<MessageDetail[]> {
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
    const arrivals: MessageDetail[] = [];
    const seen: string[] = [];
    for (const id of page.messagesAdded) {
      if (this.told.has(id)) continue;
      seen.push(id);
      const message = await this.mailbox.getMessage(id);
      if (message === null || this.ownMail(message, cursor)) continue;
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
    // Only now, with everything told: a poll that threw above starts again from the same place.
    for (const id of seen) this.told.add(id);
    cursor.historyId = page.historyId;
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
