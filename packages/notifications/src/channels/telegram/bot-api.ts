import type { ZodType } from 'zod';

import {
  apiResponseSchema,
  botSchema,
  doneSchema,
  sentSchema,
  updateSchema,
  type Update,
} from './schemas';

/** A row of buttons under a message; each sends its `callback_data` back when pressed. */
export type InlineKeyboard = { text: string; callback_data: string }[][];

/** The Bot API calls the channel makes, so a spec can stand in for Telegram. */
export interface BotApi {
  getMe(): Promise<{ username: string }>;
  /** The updates past `offset`, holding the call open up to `timeoutSeconds` for one to arrive. */
  getUpdates(offset: number | null, timeoutSeconds: number, signal: AbortSignal): Promise<Update[]>;
  sendMessage(
    chatId: string,
    html: string,
    keyboard: InlineKeyboard | null,
  ): Promise<{ messageId: number }>;
  /** Replaces a message's text, and with it any buttons under it. */
  editMessageText(chatId: string, messageId: number, html: string): Promise<void>;
  answerCallbackQuery(id: string, text: string | null): Promise<void>;
}

/**
 * A Bot API call that did not succeed, named by its method, Telegram's status
 * and description, and never by its URL — the URL carries the token, and the
 * token is in no log and no error.
 */
export class BotApiError extends Error {
  override readonly name = 'BotApiError';
  constructor(
    readonly method: string,
    /** Telegram's error code, or null when Telegram was never reached. */
    readonly status: number | null,
    readonly description: string,
    /** For a rate limit: the seconds Telegram asks the caller to wait. */
    readonly retryAfterSeconds: number | null,
  ) {
    super(`telegram ${method}: ${status === null ? '' : `${status} `}${description}`);
  }
}

const API = 'https://api.telegram.org';
/** How much longer than its own long poll a getUpdates call is given before it is abandoned. */
const POLL_GRACE_SECONDS = 10;

/** Why a call never got an answer, in words that cannot carry the URL. */
const unanswered = (error: unknown): string =>
  error instanceof Error && error.name === 'TimeoutError'
    ? 'timed out'
    : error instanceof Error && error.name === 'AbortError'
      ? 'aborted'
      : 'unreachable';

/** The Bot API over HTTPS, every answer checked against the shape Telegram documents. */
export class HttpBotApi implements BotApi {
  constructor(
    private readonly token: string,
    private readonly requestTimeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  getMe(): Promise<{ username: string }> {
    return this.call('getMe', {}, botSchema);
  }

  async getUpdates(
    offset: number | null,
    timeoutSeconds: number,
    signal: AbortSignal,
  ): Promise<Update[]> {
    return this.call(
      'getUpdates',
      {
        ...(offset === null ? {} : { offset }),
        timeout: timeoutSeconds,
        allowed_updates: ['message', 'callback_query'],
      },
      updateSchema.array(),
      AbortSignal.any([signal, AbortSignal.timeout((timeoutSeconds + POLL_GRACE_SECONDS) * 1000)]),
    );
  }

  async sendMessage(
    chatId: string,
    html: string,
    keyboard: InlineKeyboard | null,
  ): Promise<{ messageId: number }> {
    const sent = await this.call(
      'sendMessage',
      {
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(keyboard === null ? {} : { reply_markup: { inline_keyboard: keyboard } }),
      },
      sentSchema,
    );
    return { messageId: sent.message_id };
  }

  async editMessageText(chatId: string, messageId: number, html: string): Promise<void> {
    await this.call(
      'editMessageText',
      { chat_id: chatId, message_id: messageId, text: html, parse_mode: 'HTML' },
      sentSchema.or(doneSchema),
    );
  }

  async answerCallbackQuery(id: string, text: string | null): Promise<void> {
    await this.call(
      'answerCallbackQuery',
      { callback_query_id: id, ...(text === null ? {} : { text }) },
      doneSchema,
    );
  }

  private async call<T>(
    method: string,
    body: Record<string, unknown>,
    result: ZodType<T>,
    signal: AbortSignal = AbortSignal.timeout(this.requestTimeoutMs),
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${API}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      throw new BotApiError(method, null, unanswered(error), null);
    }
    const answer = apiResponseSchema.safeParse(await response.json().catch(() => null));
    if (!answer.success) {
      throw new BotApiError(method, response.status, 'an answer that is not the Bot API’s', null);
    }
    if (!answer.data.ok) {
      throw new BotApiError(
        method,
        answer.data.error_code,
        answer.data.description,
        answer.data.parameters?.retry_after ?? null,
      );
    }
    const parsed = result.safeParse(answer.data.result);
    if (!parsed.success) {
      throw new BotApiError(method, response.status, 'a result of an unexpected shape', null);
    }
    return parsed.data;
  }
}
