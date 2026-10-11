import { z } from 'zod';

import type { ChannelDefinition } from '../port';
import { HttpBotApi } from './bot-api';
import { TelegramChannel, type TelegramSettings } from './telegram-channel';

const positive = z.number().int().positive();

/** What the Telegram channel is configured with; the values live in `config/channels/` alone. */
const telegramSettingsSchema = z.strictObject({
  /** How long Telegram holds one getUpdates call open waiting for an update; under a minute. */
  pollTimeoutSeconds: z.number().int().min(1).max(50),
  /** How long any other Bot API call may take. */
  requestTimeoutMs: positive,
  /** The longest rate limit waited out; past it, the call fails into the dispatcher's own tries. */
  maxRetryAfterMs: positive,
  /** The pause after Telegram says another poller holds the token. */
  conflictBackoffMs: positive,
  /** The pause after any other failed poll. */
  errorBackoffMs: positive,
  /** The most choices shown as buttons; a longer list is answered by typing its letters. */
  maxChoiceButtons: positive,
  /** Buttons to a row; Telegram takes at most eight. */
  buttonsPerRow: z.number().int().min(1).max(8),
}) satisfies z.ZodType<TelegramSettings>;

export const TELEGRAM: ChannelDefinition<TelegramSettings> = {
  id: 'telegram',
  settings: telegramSettingsSchema,
  env: {
    token: { name: 'TELEGRAM_API_KEY', required: true },
    chatId: { name: 'TELEGRAM_CHAT_ID', required: false },
  },
  create: ({ settings, env, log }) =>
    new TelegramChannel(
      new HttpBotApi(env['token'] ?? '', settings.requestTimeoutMs),
      settings,
      env['chatId'] ?? null,
      log,
    ),
};
