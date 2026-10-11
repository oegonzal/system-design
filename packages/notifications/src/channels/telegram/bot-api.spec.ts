import { BotApiError, HttpBotApi } from './bot-api';

const TOKEN = '123456:SECRET-token';

/** Fetch scripted call by call: each answer a body, or an error thrown the way fetch throws one. */
function scripted(answers: (unknown | Error)[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as typeof fetch;
  return { calls, api: new HttpBotApi(TOKEN, 1_000, fetchImpl) };
}

describe('the Bot API over HTTPS', () => {
  it('[NTF-7] posts each call to the token’s URL and reads the result Telegram documents', async () => {
    const { calls, api } = scripted([
      { ok: true, result: { message_id: 7, chat: { id: 42 } } },
      {
        ok: true,
        result: [{ update_id: 3, message: { message_id: 9, chat: { id: 42 }, text: 'b' } }],
      },
    ]);
    expect(await api.sendMessage('42', '<b>Q</b>', [[{ text: 'a', callback_data: 'a' }]])).toEqual({
      messageId: 7,
    });
    expect(calls[0]).toEqual({
      url: `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      body: {
        chat_id: '42',
        text: '<b>Q</b>',
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: [[{ text: 'a', callback_data: 'a' }]] },
      },
    });
    const updates = await api.getUpdates(3, 25, new AbortController().signal);
    expect(updates.map((update) => update.update_id)).toEqual([3]);
    expect(calls[1]?.body).toEqual({
      offset: 3,
      timeout: 25,
      allowed_updates: ['message', 'callback_query'],
    });
  });

  it('[NTF-7] names a failure by its method, status and description — a rate limit with its wait — and never by the URL that carries the token', async () => {
    const { api } = scripted([
      {
        ok: false,
        error_code: 429,
        description: 'Too Many Requests: retry after 3',
        parameters: { retry_after: 3 },
      },
      new TypeError(`fetch failed: https://api.telegram.org/bot${TOKEN}/getMe`),
      'not the bot api',
    ]);
    const limited = await api.getMe().catch((error: unknown) => error);
    expect(limited).toEqual(new BotApiError('getMe', 429, 'Too Many Requests: retry after 3', 3));
    expect((limited as BotApiError).retryAfterSeconds).toBe(3);
    const unreachable = await api.getMe().catch((error: unknown) => error);
    expect(unreachable).toEqual(new BotApiError('getMe', null, 'unreachable', null));
    const garbled = await api.getMe().catch((error: unknown) => error);
    expect((garbled as Error).message).toBe(
      'telegram getMe: 200 an answer that is not the Bot API’s',
    );
    for (const error of [limited, unreachable, garbled]) {
      expect(String(error)).not.toContain('SECRET');
      expect(JSON.stringify(error)).not.toContain('SECRET');
    }
  });
});
