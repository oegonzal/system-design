import type { InteractionAnswer } from '@sysdesign/contracts';

import { FirstAnswer } from './first-answer';
import { fieldQuestion } from './operator-interaction';
import {
  OperatorInterrupted,
  QuestionWithdrawn,
  type OperatorPort,
  type OperatorQuestion,
  type Withdrawal,
} from './ports';

const QUESTION: OperatorQuestion = fieldQuestion(
  {
    field: {
      ref: 'e2',
      role: 'combobox',
      name: 'Work authorisation',
      inputType: null,
      options: ['Yes', 'No'],
      optionsOmitted: 0,
      value: null,
      required: true,
      invalid: false,
      maxLength: null,
      hiddenTraits: [],
      context: null,
    },
    unfilled: null,
    why: 'no evidence',
    task: null,
    page: 'Apply',
    suggestions: [],
  },
  {
    origin: { kind: 'browser-session', id: 's1', label: 'step 3' },
    expiresAt: new Date('2026-10-12T00:00:00Z'),
  },
).question;

/** A channel answered, failed or left waiting by the spec; a withdrawal rejects it as a real channel would. */
class DeferredChannel implements OperatorPort {
  readonly withdrawals: unknown[] = [];
  readonly unusedAnswers: Withdrawal[] = [];
  readonly notices: string[] = [];
  private settle: { answer(answer: InteractionAnswer): void; fail(error: unknown): void } | null =
    null;

  constructor(readonly name: string) {}

  ask(question: OperatorQuestion, signal?: AbortSignal): Promise<InteractionAnswer> {
    return new Promise<InteractionAnswer>((resolve, reject) => {
      this.settle = { answer: resolve, fail: reject };
      signal?.addEventListener(
        'abort',
        () => {
          this.withdrawals.push(signal.reason);
          reject(new QuestionWithdrawn(this.name));
        },
        { once: true },
      );
    });
  }

  answers(choiceId: string): void {
    this.settle?.answer({
      promptId: QUESTION.prompt.id,
      reply: { kind: 'choice', choiceId },
      via: { channel: this.name, ref: 'r1' },
    });
  }

  fails(error: unknown): void {
    this.settle?.fail(error);
  }

  async unused(_question: OperatorQuestion, withdrawal: Withdrawal): Promise<void> {
    this.unusedAnswers.push(withdrawal);
  }

  notify(text: string): void {
    this.notices.push(text);
  }
}

const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('the operator asked on every channel at once', () => {
  it('[BRW-10] takes the first answer and withdraws every other channel, saying who answered and what', async () => {
    const terminal = new DeferredChannel('terminal');
    const phone = new DeferredChannel('telegram');
    const asking = new FirstAnswer(terminal, [phone]).ask(QUESTION);
    await turn();
    phone.answers('c2');
    expect(await asking).toMatchObject({ reply: { choiceId: 'c2' }, via: { channel: 'telegram' } });
    expect(terminal.withdrawals).toEqual([
      { reason: 'answered-elsewhere', note: 'answered via telegram: b: No' },
    ]);
    expect(phone.withdrawals).toEqual([]);
  });

  it('[BRW-10] tells a channel that answered in the same moment that its answer went unused', async () => {
    const terminal = new DeferredChannel('terminal');
    const phone = new DeferredChannel('telegram');
    const asking = new FirstAnswer(terminal, [phone]).ask(QUESTION);
    await turn();
    terminal.answers('c1');
    phone.answers('c2');
    expect(await asking).toMatchObject({ via: { channel: 'terminal' } });
    expect(phone.unusedAnswers).toEqual([
      { reason: 'answered-elsewhere', note: 'answered via terminal: a: Yes' },
    ]);
  });

  it('[BRW-10] says once that a channel failed while another asks, once that it is back, and fails only when every channel does', async () => {
    const terminal = new DeferredChannel('terminal');
    const phone = new DeferredChannel('notifications');
    const operator = new FirstAnswer(terminal, [phone]);

    let asking = operator.ask(QUESTION);
    await turn();
    phone.fails(new Error('the notifications service is unreachable: no answer'));
    await turn();
    terminal.answers('c1');
    await asking;
    asking = operator.ask(QUESTION);
    await turn();
    phone.fails(new Error('the notifications service is unreachable: no answer'));
    await turn();
    terminal.answers('c1');
    await asking;
    expect(terminal.notices).toEqual([
      'notifications could not ask: the notifications service is unreachable: no answer — asking on the others',
    ]);

    asking = operator.ask(QUESTION);
    await turn();
    phone.answers('c2');
    await asking;
    expect(terminal.notices.at(-1)).toBe('notifications is asking again');

    asking = operator.ask(QUESTION);
    await turn();
    terminal.fails(new Error('the terminal input closed'));
    phone.fails(new Error('refused'));
    await expect(asking).rejects.toThrow(
      'no operator channel could ask: terminal: the terminal input closed; notifications: refused',
    );
  });

  it('[BRW-10] withdraws the rest as abandoned when the operator interrupts at the terminal, and passes the caller’s withdrawal to every channel', async () => {
    const terminal = new DeferredChannel('terminal');
    const phone = new DeferredChannel('notifications');
    const operator = new FirstAnswer(terminal, [phone]);
    const interrupted = operator.ask(QUESTION);
    await turn();
    terminal.fails(new OperatorInterrupted());
    await expect(interrupted).rejects.toBeInstanceOf(OperatorInterrupted);
    expect(phone.withdrawals).toEqual([
      { reason: 'abandoned', note: 'interrupted at the terminal' },
    ]);

    const superseded = new AbortController();
    const asking = operator.ask(QUESTION, superseded.signal);
    await turn();
    superseded.abort({ reason: 'superseded', note: 'suggested answers arrived' });
    await expect(asking).rejects.toBeInstanceOf(QuestionWithdrawn);
    expect(phone.withdrawals.at(-1)).toEqual({
      reason: 'superseded',
      note: 'suggested answers arrived',
    });
    expect(terminal.withdrawals.at(-1)).toEqual({
      reason: 'superseded',
      note: 'suggested answers arrived',
    });
    operator.notify('step 4');
    expect(terminal.notices).toEqual(['step 4']);
  });

  it('[BRW-10] a question already withdrawn when it is asked goes to no channel', async () => {
    const terminal = new DeferredChannel('terminal');
    const phone = new DeferredChannel('notifications');
    const operator = new FirstAnswer(terminal, [phone]);
    const stopped = new AbortController();
    stopped.abort({ reason: 'abandoned', note: 'the session is stopping' });
    await expect(operator.ask(QUESTION, stopped.signal)).rejects.toBeInstanceOf(QuestionWithdrawn);
    expect([terminal.withdrawals, phone.withdrawals]).toEqual([[], []]);
  });
});
