import { createInterface, type Interface } from 'node:readline';

import { choiceKey, howToAnswer, readReply, type InteractionAnswer } from '@sysdesign/contracts';

import {
  OperatorInterrupted,
  QuestionWithdrawn,
  type OperatorPort,
  type OperatorQuestion,
  type Withdrawal,
} from '../../core/ports';

/**
 * The operator at the terminal. A question is shown the way every channel
 * shows it — its title and details, its choices lettered, its commands — and
 * a typed line is read the one declared way, `readReply`; a line it refuses is
 * answered with how the question is answered, and asked again. An empty line
 * is the question's Enter command: read back what was typed into the page, or
 * go on. When another channel answers first the question is withdrawn here
 * with who answered, and a line typed while no question is open is said to
 * be unused rather than kept for the next one.
 */
export const OPERATOR_PROMPT = '> ';

/** What the terminal reads and writes; the spec injects its own. */
export interface TerminalIo {
  /** The next line typed; rejects once the signal aborts, and with `OperatorInterrupted` on Ctrl-C. */
  question(prompt: string, signal?: AbortSignal): Promise<string>;
  write(text: string): void;
  close(): void;
}

/** A question as the terminal shows it, line by line. */
export function renderQuestion(question: OperatorQuestion): string[] {
  const { prompt } = question;
  const width = Math.max(0, ...prompt.commands.map((command) => command.id.length + 1));
  return [
    '──── operator needed ────',
    prompt.title,
    ...prompt.details,
    ...(prompt.choices.length === 0 ? [] : ['']),
    ...prompt.choices.map(
      (choice, index) =>
        `  ${choiceKey(index)}) ${choice.label}${choice.note === null ? '' : `   (${choice.note})`}`,
    ),
    ...(prompt.commands.length === 0 ? [] : ['']),
    ...prompt.commands.map(
      (command) =>
        `  ${`/${command.id}`.padEnd(width)}  ${command.label}${command.id === question.enter ? '   (Enter alone)' : ''}`,
    ),
    howToAnswer(prompt),
  ];
}

/** What a withdrawal says to the person at the terminal. */
const withdrawnLine = (reason: unknown): string => {
  const withdrawal = reason as Partial<Withdrawal> | undefined;
  return `── ${withdrawal?.note ?? withdrawal?.reason ?? 'no longer asked'} ──`;
};

/**
 * The terminal as one reader for the whole session: a line answers the
 * question open when it is typed, and a line typed with none open is said to
 * be unused — never kept to answer the next question, which a reader opened
 * per question would do. Ctrl-C stops the open question; with none open it is
 * the process's own, as it would be without a reader.
 */
export function terminalIo(
  input: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): TerminalIo {
  let reader: Interface | null = null;
  let open: { resolve(line: string): void; reject(error: Error): void } | null = null;
  const take = (): typeof open => {
    const taken = open;
    open = null;
    return taken;
  };
  const close = (): void => {
    reader?.close();
    reader = null;
  };
  const opened = (): Interface => {
    if (reader !== null) return reader;
    const created = createInterface({ input, output, terminal: input.isTTY === true });
    created.on('line', (line) => {
      const waiting = take();
      if (waiting === null) output.write('(no question is open: that line was not used)\n');
      else waiting.resolve(line);
    });
    created.on('SIGINT', () => {
      const waiting = take();
      if (waiting !== null) {
        waiting.reject(new OperatorInterrupted());
        return;
      }
      close();
      process.kill(process.pid, 'SIGINT');
    });
    created.on('close', () => {
      reader = null;
      take()?.reject(new Error('the terminal input closed'));
    });
    reader = created;
    return created;
  };
  return {
    question(prompt, signal) {
      return new Promise<string>((resolve, reject) => {
        if (signal?.aborted === true) {
          reject(new QuestionWithdrawn('the terminal'));
          return;
        }
        const listening = opened();
        open = { resolve, reject };
        signal?.addEventListener(
          'abort',
          () => {
            if (open?.resolve !== resolve) return;
            open = null;
            reject(new QuestionWithdrawn('the terminal'));
          },
          { once: true },
        );
        listening.setPrompt(prompt);
        listening.prompt();
      });
    },
    write(text) {
      output.write(`${text}\n`);
    },
    close,
  };
}

export class TerminalOperator implements OperatorPort {
  readonly name = 'terminal';
  private lines = 0;

  constructor(private readonly io: TerminalIo = terminalIo()) {}

  async ask(question: OperatorQuestion, signal?: AbortSignal): Promise<InteractionAnswer> {
    this.io.write(renderQuestion(question).join('\n'));
    for (;;) {
      let line: string;
      try {
        line = await this.io.question(OPERATOR_PROMPT, signal);
      } catch (error) {
        if (error instanceof QuestionWithdrawn) this.io.write(withdrawnLine(signal?.reason));
        throw error;
      }
      this.lines += 1;
      const typed = line.trim() === '' && question.enter !== null ? `/${question.enter}` : line;
      const reading = readReply(question.prompt, typed);
      if (reading.kind === 'reply') {
        return {
          promptId: question.prompt.id,
          reply: reading.reply,
          via: { channel: this.name, ref: `line-${this.lines}` },
        };
      }
      this.io.write(reading.reason);
    }
  }

  async unused(_question: OperatorQuestion, withdrawal: Withdrawal): Promise<void> {
    this.io.write(`── not used: ${withdrawal.note ?? withdrawal.reason} ──`);
  }

  notify(text: string): void {
    this.io.write(text);
  }

  /** The reader released, so the process ends as it would without one. */
  close(): void {
    this.io.close();
  }
}
