import { BotApiError, type BotApi, type InlineKeyboard } from './bot-api';
import type { Update } from './schemas';

/**
 * Telegram for specs: updates scripted in batches, every call recorded, and
 * the errors Telegram answers with — a second poller, a rate limit, a refused
 * edit — scripted per method.
 */
export class FakeBotApi implements BotApi {
  readonly sent: {
    chatId: string;
    html: string;
    keyboard: InlineKeyboard | null;
    messageId: number;
  }[] = [];
  readonly edited: { chatId: string; messageId: number; html: string }[] = [];
  readonly answered: { id: string; text: string | null }[] = [];
  /** The offset each getUpdates call confirmed. */
  readonly offsets: (number | null)[] = [];
  private readonly batches: Update[][] = [];
  private readonly failures = new Map<string, BotApiError[]>();
  private nextMessageId = 100;
  private wake: (() => void) | null = null;

  constructor(readonly username = 'spec_bot') {}

  /** The next updates getUpdates hands out. */
  push(...updates: Update[]): void {
    this.batches.push(updates);
    this.wake?.();
  }

  /** The next call of a method fails so. */
  fail(
    method: string,
    status: number | null,
    description: string,
    retryAfterSeconds: number | null = null,
  ): void {
    const queue = this.failures.get(method) ?? [];
    queue.push(new BotApiError(method, status, description, retryAfterSeconds));
    this.failures.set(method, queue);
  }

  async getMe(): Promise<{ username: string }> {
    this.failing('getMe');
    return { username: this.username };
  }

  async getUpdates(
    offset: number | null,
    _timeoutSeconds: number,
    signal: AbortSignal,
  ): Promise<Update[]> {
    this.offsets.push(offset);
    this.failing('getUpdates');
    const batch = this.batches.shift();
    if (batch !== undefined) return batch;
    await new Promise<void>((resolve) => {
      this.wake = resolve;
      signal.addEventListener('abort', () => resolve(), { once: true });
      setTimeout(resolve, 20);
    });
    return [];
  }

  async sendMessage(
    chatId: string,
    html: string,
    keyboard: InlineKeyboard | null,
  ): Promise<{ messageId: number }> {
    this.failing('sendMessage');
    this.nextMessageId += 1;
    this.sent.push({ chatId, html, keyboard, messageId: this.nextMessageId });
    return { messageId: this.nextMessageId };
  }

  async editMessageText(chatId: string, messageId: number, html: string): Promise<void> {
    this.failing('editMessageText');
    this.edited.push({ chatId, messageId, html });
  }

  async answerCallbackQuery(id: string, text: string | null): Promise<void> {
    this.failing('answerCallbackQuery');
    this.answered.push({ id, text });
  }

  private failing(method: string): void {
    const failure = this.failures.get(method)?.shift();
    if (failure !== undefined) throw failure;
  }
}

/** A message a person typed in a chat, as Telegram hands it over. */
export const typedUpdate = (
  updateId: number,
  chat: number,
  text: string,
  replyTo: number | null = null,
): Update => ({
  update_id: updateId,
  message: {
    message_id: 1_000 + updateId,
    chat: { id: chat },
    text,
    ...(replyTo === null ? {} : { reply_to_message: { message_id: replyTo } }),
  },
});

/** A button a person pressed under a message, as Telegram hands it over. */
export const pressedUpdate = (
  updateId: number,
  chat: number,
  messageId: number,
  data: string,
): Update => ({
  update_id: updateId,
  callback_query: {
    id: `cb${updateId}`,
    message: { message_id: messageId, chat: { id: chat } },
    data,
  },
});
