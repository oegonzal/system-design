import { excerpt, type InteractionPrompt } from '@sysdesign/contracts';

import type {
  ChannelDelivery,
  ChannelLog,
  InboundMessage,
  InboundSink,
  InboundVerdict,
  NotificationChannel,
} from '../port';
import { BotApiError, type BotApi } from './bot-api';
import { closedPart, escapeHtml, renderPrompt, type ButtonLimits } from './render';
import type { Update } from './schemas';

/** What the Telegram channel is configured with, besides its token and its chat. */
export interface TelegramSettings extends ButtonLimits {
  pollTimeoutSeconds: number;
  requestTimeoutMs: number;
  maxRetryAfterMs: number;
  conflictBackoffMs: number;
  errorBackoffMs: number;
}

/** Which bot and chat one instance serves, and the variables it binds to them, which it names in what it says. */
export interface TelegramInstance {
  id: string;
  /** The one chat it serves; null until one is named. */
  chatId: string | null;
  /** The username its token must belong to; null leaves the token's bot unchecked. */
  bot: string | null;
  /** The variable bound to each of `token`, `bot` and `chatId`. */
  variables: Readonly<Record<string, string>>;
}

/** A username as Telegram compares one: without its `@`, in any case. */
const handle = (username: string): string =>
  (username.startsWith('@') ? username.slice(1) : username).toLowerCase();

/** Telegram's limit on the text a button press is answered with. */
const CALLBACK_ANSWER_MAX = 200;
/** The statuses that say the token itself was refused. */
const TOKEN_REFUSED = new Set([401, 404]);

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/**
 * Telegram as a channel instance: one bot, one chat. Prompts go to the chat
 * its instance names as messages with a button per letter and per command;
 * what the person types or presses there goes to the service as it is, a
 * press exactly as typing it would. With no chat named, the bot answers
 * `/start` with the chat id to name and delivers nothing; with one named,
 * every other chat is ignored. A token that belongs to another bot than the
 * one its instance names never starts polling. Updates are long-polled, each
 * confirmed only by the next poll once it was handled. A second poller on the
 * same token is waited out, a rate limit waited out within its cap, and a
 * refused edit taken as an edit there is nothing more to do for.
 */
export class TelegramChannel implements NotificationChannel {
  readonly id: string;
  private readonly chatId: string | null;
  private sink: InboundSink | null = null;
  private stopping: AbortController | null = null;
  private polling: Promise<void> | null = null;
  private username: string | null = null;

  constructor(
    private readonly api: BotApi,
    private readonly settings: TelegramSettings,
    private readonly instance: TelegramInstance,
    private readonly log: ChannelLog,
  ) {
    this.id = instance.id;
    this.chatId = instance.chatId;
  }

  async start(sink: InboundSink): Promise<void> {
    const { bot } = this.instance;
    try {
      this.username = (await this.api.getMe()).username;
    } catch (error) {
      if (
        error instanceof BotApiError &&
        error.status !== null &&
        TOKEN_REFUSED.has(error.status)
      ) {
        throw new Error(`Telegram refused ${this.named('token')}: ${error.description}`);
      }
      const unchecked = bot === null ? '' : ` with ${this.named('bot')} unchecked`;
      this.log.warn(`Telegram unreachable at start, polling anyway${unchecked}: ${String(error)}`);
    }
    if (bot !== null && this.username !== null && handle(bot) !== handle(this.username)) {
      throw new Error(
        `${this.named('token')} belongs to @${this.username}, not ${this.named('bot')} @${handle(bot)}`,
      );
    }
    this.sink = sink;
    this.stopping = new AbortController();
    this.polling = this.poll(this.stopping.signal);
    const shown = this.username === null ? 'the bot' : `@${this.username}`;
    this.log.log(
      this.chatId === null
        ? `unpaired: send /start to ${shown} for the chat id to set as ${this.named('chatId')}`
        : `serving one chat as ${shown}`,
    );
  }

  async stop(): Promise<void> {
    this.stopping?.abort();
    await this.polling;
    this.sink = null;
  }

  async deliver(prompt: InteractionPrompt): Promise<ChannelDelivery[]> {
    const chat = this.chatId;
    if (chat === null) return [];
    const { parts, keyboard } = renderPrompt(prompt, this.settings);
    let last: number | null = null;
    for (const [index, part] of parts.entries()) {
      const buttons = index === parts.length - 1 ? keyboard : null;
      last = (await this.limited(() => this.api.sendMessage(chat, part, buttons))).messageId;
    }
    return last === null ? [] : [{ address: chat, messageRef: String(last) }];
  }

  async close(
    delivery: ChannelDelivery,
    prompt: InteractionPrompt,
    outcome: string,
  ): Promise<void> {
    const html = closedPart(prompt, this.settings, outcome);
    try {
      await this.limited(() =>
        this.api.editMessageText(delivery.address, Number(delivery.messageRef), html),
      );
    } catch (error) {
      // A request Telegram refuses outright — the message gone, too old, already showing this — will not succeed on a retry.
      if (error instanceof BotApiError && error.status === 400) {
        this.log.warn(`message ${delivery.messageRef} left as it was: ${error.description}`);
        return;
      }
      throw error;
    }
  }

  /** A call made again once after a rate limit, when Telegram asks for no longer than the cap. */
  private async limited<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      const wait =
        error instanceof BotApiError && error.status === 429 && error.retryAfterSeconds !== null
          ? error.retryAfterSeconds * 1000
          : null;
      if (wait === null || wait > this.settings.maxRetryAfterMs) throw error;
      await sleep(wait);
      return call();
    }
  }

  private async poll(signal: AbortSignal): Promise<void> {
    let offset: number | null = null;
    let conflicted = false;
    while (!signal.aborted) {
      try {
        const updates = await this.api.getUpdates(offset, this.settings.pollTimeoutSeconds, signal);
        conflicted = false;
        for (const update of updates) {
          await this.handle(update);
          // Confirmed by the next poll, so an update not yet handled comes round again.
          offset = update.update_id + 1;
        }
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof BotApiError && error.status === 409) {
          if (!conflicted) this.log.warn(`another poller holds this token: ${error.description}`);
          conflicted = true;
          await sleep(this.settings.conflictBackoffMs, signal);
        } else {
          this.log.warn(`polling failed: ${String(error)}`);
          await sleep(this.settings.errorBackoffMs, signal);
        }
      }
    }
  }

  private async handle(update: Update): Promise<void> {
    try {
      if (update.callback_query !== undefined) await this.pressed(update.callback_query);
      else if (update.message?.text !== undefined)
        await this.typed(update.message, update.message.text);
    } catch (error) {
      this.log.warn(`update ${update.update_id} not handled: ${String(error)}`);
    }
  }

  private async typed(message: NonNullable<Update['message']>, typed: string): Promise<void> {
    const chat = String(message.chat.id);
    const text = this.command(typed);
    if (text === '/start' || text.startsWith('/start ')) return this.started(chat);
    if (chat !== this.chatId) return;
    const verdict = await this.received({
      address: chat,
      ref: `m${message.message_id}`,
      inReplyTo:
        message.reply_to_message === undefined ? null : String(message.reply_to_message.message_id),
      text,
    });
    if (verdict.kind === 'refused') {
      await this.limited(() => this.api.sendMessage(chat, escapeHtml(verdict.text), null));
    }
  }

  private async pressed(query: NonNullable<Update['callback_query']>): Promise<void> {
    const chat = query.message === undefined ? null : String(query.message.chat.id);
    if (
      query.message === undefined ||
      chat === null ||
      chat !== this.chatId ||
      query.data === undefined
    ) {
      await this.api.answerCallbackQuery(query.id, null);
      return;
    }
    const verdict = await this.received({
      address: chat,
      ref: `q${query.id}`,
      inReplyTo: String(query.message.message_id),
      text: query.data,
    });
    await this.api.answerCallbackQuery(
      query.id,
      verdict.kind === 'ignored' ? null : excerpt(verdict.text, CALLBACK_ANSWER_MAX),
    );
  }

  private async started(chat: string): Promise<void> {
    if (this.chatId === null) {
      await this.api.sendMessage(
        chat,
        `This chat's id is <code>${escapeHtml(chat)}</code>. Set <code>${escapeHtml(this.named('chatId'))}=${escapeHtml(chat)}</code> where the notifications service reads its environment, and restart it: questions will arrive here.`,
        null,
      );
    } else if (chat === this.chatId) {
      await this.api.sendMessage(chat, 'Connected: questions will arrive here.', null);
    }
  }

  /** What the service makes of a message; a service that failed taking it says so, and the person sends it again. */
  private async received(message: Omit<InboundMessage, 'channel'>): Promise<InboundVerdict> {
    if (this.sink === null) return { kind: 'ignored' };
    try {
      return await this.sink.receive({ channel: this.id, ...message });
    } catch (error) {
      this.log.warn(`reply ${message.ref} not taken: ${String(error)}`);
      return { kind: 'refused', text: 'That could not be taken just now: send it again.' };
    }
  }

  /** The variable the instance binds to a key, as the channel names it in what it says. */
  private named(key: 'token' | 'bot' | 'chatId'): string {
    return this.instance.variables[key] ?? key;
  }

  /** A command addressed to this bot by name — `/blank@bot` — is the command itself. */
  private command(text: string): string {
    const named = this.username === null ? null : `@${this.username}`;
    const [first = '', ...rest] = text.trim().split(/\s+/);
    if (named === null || !first.startsWith('/') || !first.endsWith(named)) return text.trim();
    return [first.slice(0, -named.length), ...rest].join(' ');
  }
}
