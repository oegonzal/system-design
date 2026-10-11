import type { InboundMessage, InboundSink, InboundVerdict } from '../port';
import { promptOf } from '../testing';
import { TelegramChannel, type TelegramSettings } from './telegram-channel';
import { FakeBotApi, pressedUpdate, typedUpdate } from './testing';

const SETTINGS: TelegramSettings = {
  pollTimeoutSeconds: 1,
  requestTimeoutMs: 1_000,
  maxRetryAfterMs: 2_000,
  conflictBackoffMs: 20,
  errorBackoffMs: 20,
  maxChoiceButtons: 4,
  buttonsPerRow: 3,
};

/** The service as the channel sees it: every message recorded, each answered with the verdict scripted. */
class RecordingSink implements InboundSink {
  readonly received: InboundMessage[] = [];
  verdict: InboundVerdict = { kind: 'accepted', text: 'Taken: b: Female.' };
  async receive(message: InboundMessage): Promise<InboundVerdict> {
    this.received.push(message);
    return this.verdict;
  }
}

async function until(holds: () => boolean, ms = 3_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!holds()) {
    if (Date.now() > deadline) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function channel(chatId: string | null = '42') {
  const api = new FakeBotApi();
  const warnings: string[] = [];
  const notes: string[] = [];
  const sink = new RecordingSink();
  const telegram = new TelegramChannel(api, SETTINGS, chatId, {
    log: (message) => notes.push(message),
    warn: (message) => warnings.push(message),
  });
  return { api, sink, telegram, warnings, notes };
}

describe('the Telegram channel', () => {
  it('[NTF-7] delivers to the one chat it serves, buttons under the message, and shows the outcome there with its buttons gone', async () => {
    const { api, telegram } = channel();
    const prompt = promptOf();
    expect(await telegram.deliver(prompt)).toEqual([{ address: '42', messageRef: '101' }]);
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]?.keyboard?.flat().map((button) => button.callback_data)).toEqual([
      'a',
      'b',
      '/blank',
    ]);
    await telegram.close({ address: '42', messageRef: '101' }, prompt, 'Answered: b: Female');
    expect(api.edited).toEqual([
      {
        chatId: '42',
        messageId: 101,
        html: expect.stringMatching(/\n\n<b>Answered: b: Female<\/b>$/),
      },
    ]);
  });

  it('[NTF-7] hands the service what its chat types or presses, as it is, confirms each update once handled, and answers every press', async () => {
    const { api, sink, telegram } = channel();
    await telegram.start(sink);
    api.push(
      typedUpdate(1, 42, 'b', 101),
      pressedUpdate(2, 42, 101, '/blank'),
      typedUpdate(3, 7, 'a'),
      pressedUpdate(4, 7, 55, 'a'),
      typedUpdate(5, 42, '/blank@spec_bot'),
    );
    await until(() => api.answered.length === 2 && sink.received.length === 3);
    await until(() => api.offsets.includes(6));
    await telegram.stop();
    expect(sink.received).toEqual([
      { channel: 'telegram', address: '42', ref: 'm1001', inReplyTo: '101', text: 'b' },
      { channel: 'telegram', address: '42', ref: 'qcb2', inReplyTo: '101', text: '/blank' },
      { channel: 'telegram', address: '42', ref: 'm1005', inReplyTo: null, text: '/blank' },
    ]);
    // A press from another chat is answered, and taken nowhere.
    expect(api.answered).toEqual([
      { id: 'cb2', text: 'Taken: b: Female.' },
      { id: 'cb4', text: null },
    ]);
    expect(api.offsets[0]).toBeNull();
  });

  it('[NTF-7] sends a refusal back to the chat, escaped', async () => {
    const { api, sink, telegram } = channel();
    sink.verdict = {
      kind: 'refused',
      text: '"x <y>" is none of the choices. Reply with a letter (a, b).',
    };
    await telegram.start(sink);
    api.push(typedUpdate(1, 42, 'x <y>'));
    await until(() => api.sent.length === 1);
    await telegram.stop();
    expect(api.sent[0]).toMatchObject({
      chatId: '42',
      html: '"x &lt;y&gt;" is none of the choices. Reply with a letter (a, b).',
      keyboard: null,
    });
  });

  it('[NTF-7] answers /start with the chat id while it serves no chat and delivers nothing, and once paired ignores every other chat', async () => {
    const unpaired = channel(null);
    await unpaired.telegram.start(unpaired.sink);
    expect(unpaired.notes).toEqual([
      'unpaired: send /start to @spec_bot for the chat id to set as TELEGRAM_CHAT_ID',
    ]);
    expect(await unpaired.telegram.deliver(promptOf())).toEqual([]);
    unpaired.api.push(typedUpdate(1, 99, '/start'), typedUpdate(2, 99, 'b'));
    await until(() => unpaired.api.sent.length === 1);
    await unpaired.telegram.stop();
    expect(unpaired.api.sent[0]).toMatchObject({
      chatId: '99',
      html: expect.stringContaining('TELEGRAM_CHAT_ID=99'),
    });
    expect(unpaired.sink.received).toEqual([]);

    const paired = channel();
    await paired.telegram.start(paired.sink);
    paired.api.push(typedUpdate(1, 7, '/start'), typedUpdate(2, 42, '/start'));
    await until(() => paired.api.offsets.includes(3));
    await paired.telegram.stop();
    expect(paired.api.sent.map((sent) => [sent.chatId, sent.html])).toEqual([
      ['42', 'Connected: questions will arrive here.'],
    ]);
  });

  it('[NTF-7] waits out a second poller and a rate limit within its cap, takes a refused edit as done, and refuses to start on a rejected token', async () => {
    const { api, sink, telegram, warnings } = channel();
    api.fail('getUpdates', 409, 'Conflict: terminated by other getUpdates request');
    api.fail('getUpdates', 409, 'Conflict: terminated by other getUpdates request');
    await telegram.start(sink);
    api.push(typedUpdate(1, 42, 'b'));
    await until(() => sink.received.length === 1);
    expect(warnings.filter((warning) => warning.startsWith('another poller'))).toHaveLength(1);

    api.fail('sendMessage', 429, 'Too Many Requests: retry after 1', 1);
    const started = Date.now();
    expect(await telegram.deliver(promptOf())).toHaveLength(1);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    api.fail('sendMessage', 429, 'Too Many Requests: retry after 5', 5);
    await expect(telegram.deliver(promptOf())).rejects.toThrow('telegram sendMessage: 429');

    api.fail('editMessageText', 400, 'Bad Request: message is not modified');
    await telegram.close({ address: '42', messageRef: '101' }, promptOf(), 'Answered: a: Male');
    expect(warnings.at(-1)).toBe(
      'message 101 left as it was: Bad Request: message is not modified',
    );
    await telegram.stop();

    const refused = channel();
    refused.api.fail('getMe', 401, 'Unauthorized');
    await expect(refused.telegram.start(refused.sink)).rejects.toThrow(
      'Telegram refused TELEGRAM_API_KEY: Unauthorized',
    );
    const offline = channel();
    offline.api.fail('getMe', null, 'unreachable');
    await offline.telegram.start(offline.sink);
    expect(offline.warnings).toEqual([
      'Telegram unreachable at start, polling anyway: BotApiError: telegram getMe: unreachable',
    ]);
    await offline.telegram.stop();
  });
});
