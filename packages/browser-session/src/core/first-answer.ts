import {
  describeReply,
  excerpt,
  WITHDRAWAL_NOTE_MAX_LENGTH,
  type InteractionAnswer,
} from '@sysdesign/contracts';

import {
  OperatorInterrupted,
  QuestionWithdrawn,
  type OperatorChannel,
  type OperatorPort,
  type OperatorQuestion,
  type Withdrawal,
} from './ports';

type Settled = { index: number; answer: InteractionAnswer } | { index: number; error: unknown };

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The operator asked on every channel at once — the terminal always, and each
 * channel the settings add — and the first answer taken. Every other channel
 * is withdrawn with who answered and what, and each withdrawal awaited, so no
 * channel goes on showing a question no longer asked; one that answered too,
 * in the same moment, is told its answer went unused. A channel that fails
 * while another still asks is said once, and its recovery once; only every
 * channel failing fails the question. Ctrl-C at the terminal is the operator
 * stopping the question: the others are withdrawn as abandoned, and the
 * interruption goes on to end the session.
 */
export class FirstAnswer implements OperatorPort {
  readonly name = 'first-answer';
  private readonly failing = new Set<string>();

  constructor(
    private readonly terminal: OperatorPort,
    private readonly others: readonly OperatorChannel[],
  ) {}

  notify(text: string): void {
    this.terminal.notify(text);
  }

  async unused(question: OperatorQuestion, withdrawal: Withdrawal): Promise<void> {
    await Promise.allSettled(
      [this.terminal, ...this.others].map((channel) => channel.unused(question, withdrawal)),
    );
  }

  async ask(question: OperatorQuestion, signal?: AbortSignal): Promise<InteractionAnswer> {
    const channels: readonly OperatorChannel[] = [this.terminal, ...this.others];
    const controllers = channels.map(() => new AbortController());
    const onAbort = (): void => {
      for (const controller of controllers) controller.abort(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const asks = channels.map((channel, index): Promise<Settled> =>
      channel.ask(question, controllers[index]?.signal).then(
        (answer) => ({ index, answer }),
        (error: unknown) => ({ index, error }),
      ),
    );
    try {
      const waiting = new Set(channels.keys());
      const failures: string[] = [];
      while (waiting.size > 0) {
        const settled = await Promise.race(
          [...waiting].map((index) => asks[index] as Promise<Settled>),
        );
        waiting.delete(settled.index);
        const channel = channels[settled.index] as OperatorChannel;
        if ('answer' in settled) {
          this.recovered(channel);
          const note = excerpt(
            `answered via ${settled.answer.via.channel}: ${describeReply(question.prompt, settled.answer.reply)}`,
            WITHDRAWAL_NOTE_MAX_LENGTH,
          );
          await this.withdraw(question, channels, controllers, asks, waiting, {
            reason: 'answered-elsewhere',
            note,
          });
          return settled.answer;
        }
        if (settled.error instanceof OperatorInterrupted) {
          await this.withdraw(question, channels, controllers, asks, waiting, {
            reason: 'abandoned',
            note: 'interrupted at the terminal',
          });
          throw settled.error;
        }
        if (settled.error instanceof QuestionWithdrawn) continue;
        failures.push(`${channel.name}: ${messageOf(settled.error)}`);
        this.failed(channel, settled.error, waiting.size > 0);
      }
      if (signal?.aborted === true) throw new QuestionWithdrawn(this.name);
      throw new Error(`no operator channel could ask: ${failures.join('; ')}`);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /** The question withdrawn from every channel still asking, each awaited; one that answered after all is told it went unused. */
  private async withdraw(
    question: OperatorQuestion,
    channels: readonly OperatorChannel[],
    controllers: readonly AbortController[],
    asks: readonly Promise<Settled>[],
    waiting: ReadonlySet<number>,
    withdrawal: Withdrawal,
  ): Promise<void> {
    for (const index of waiting) controllers[index]?.abort(withdrawal);
    const losers = await Promise.all([...waiting].map((index) => asks[index] as Promise<Settled>));
    for (const loser of losers) {
      const channel = channels[loser.index] as OperatorChannel;
      if ('answer' in loser) {
        this.recovered(channel);
        await channel
          .unused(question, withdrawal)
          .catch((error: unknown) => this.failed(channel, error, true));
      } else if (loser.error instanceof QuestionWithdrawn) {
        this.recovered(channel);
      } else {
        this.failed(channel, loser.error, true);
      }
    }
  }

  private failed(channel: OperatorChannel, error: unknown, othersAsking: boolean): void {
    if (this.failing.has(channel.name)) return;
    this.failing.add(channel.name);
    this.terminal.notify(
      `${channel.name} could not ask: ${messageOf(error)}${othersAsking ? ' — asking on the others' : ''}`,
    );
  }

  private recovered(channel: OperatorChannel): void {
    if (this.failing.delete(channel.name)) this.terminal.notify(`${channel.name} is asking again`);
  }
}
