import type { InteractionPrompt, PublishEventRequest } from '@sysdesign/contracts';
import { BusCallAborted, BusUnreachable } from '@sysdesign/notifications-client';

import { QuestionWithdrawn, type OperatorQuestion } from '../../core/ports';
import { SESSION_KIND } from '../../core/identity';
import { NotificationsOperator } from './notifications-operator';

const PROMPT = {
  id: '5d1e2f30-8192-4ca3-b4d5-e6f708192a3b',
  origin: { kind: 'browser-session', id: 's1', label: 'step 3' },
  title: 'Gender',
  details: [],
  choices: [{ id: 'c1', label: 'Male', note: null }],
  freeText: null,
  commands: [],
  expiresAt: '2026-10-12T00:00:00.000Z',
} satisfies InteractionPrompt;
const QUESTION: OperatorQuestion = { prompt: PROMPT, enter: null };

describe('the operator through the notifications service', () => {
  it('[BRW-10] asks with the prompt and the abort, reads a withdrawn ask as withdrawn, and publishes an unused answer as a withdrawal', async () => {
    const published: PublishEventRequest[] = [];
    const bus = {
      publish: async (request: PublishEventRequest) => (published.push(request), {} as never),
    };
    const seen: { prompt: InteractionPrompt; signal: AbortSignal | undefined }[] = [];
    const answer = {
      promptId: PROMPT.id,
      reply: { kind: 'choice', choiceId: 'c1' },
      via: { channel: 'telegram', ref: 'm1' },
    } as const;
    const answering = new NotificationsOperator(
      { ask: async (prompt, signal) => (seen.push({ prompt, signal }), answer) },
      bus,
    );
    const signal = new AbortController().signal;
    expect(await answering.ask(QUESTION, signal)).toEqual(answer);
    expect(seen).toEqual([{ prompt: PROMPT, signal }]);

    const withdrawn = new NotificationsOperator(
      {
        ask: async () => {
          throw new BusCallAborted('ask');
        },
      },
      bus,
    );
    await expect(withdrawn.ask(QUESTION)).rejects.toBeInstanceOf(QuestionWithdrawn);
    const down = new NotificationsOperator(
      {
        ask: async () => {
          throw new BusUnreachable();
        },
      },
      bus,
    );
    await expect(down.ask(QUESTION)).rejects.toBeInstanceOf(BusUnreachable);

    await answering.unused(QUESTION, {
      reason: 'answered-elsewhere',
      note: 'answered via terminal: a: Male',
    });
    expect(published).toEqual([
      {
        topic: 'interaction.withdrawn',
        source: SESSION_KIND,
        payload: {
          promptId: PROMPT.id,
          reason: 'answered-elsewhere',
          note: 'answered via terminal: a: Male',
        },
      },
    ]);
  });
});
