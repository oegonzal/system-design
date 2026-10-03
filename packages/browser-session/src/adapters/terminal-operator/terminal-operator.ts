import { createInterface } from 'node:readline/promises';

import { fieldTypeOf } from '../../core/field-routing';
import type { OperatorPort, OperatorPrompt, OperatorReply } from '../../core/ports';
import { quote } from '../../core/text';

/**
 * The operator at the terminal. A field that needs a person is highlighted
 * in the browser while the terminal shows the field, the question beside
 * it, the model's suggested value and why it was not trusted; the operator
 * types the answer, or fills the page and presses Enter so the field is read
 * back, or types one of the two commands. The readline is opened per
 * question and closed after it, so an idle session does not hold stdin.
 */
export const OPERATOR_COMMANDS = { blank: '/blank', stop: '/stop' } as const;

export const OPERATOR_PROMPT = '> ';
export const CONTINUE_PROMPT = 'Press Enter to continue… ';

/** What the terminal reads and writes; the spec injects its own. */
export interface TerminalIo {
  question(prompt: string): Promise<string>;
  write(text: string): void;
}

/** The reply one typed line means: nothing typed is "read the field back". */
export function replyOf(line: string): OperatorReply {
  const text = line.trim();
  if (text === '') return { kind: 'read-back' };
  if (text === OPERATOR_COMMANDS.blank) return { kind: 'blank' };
  if (text === OPERATOR_COMMANDS.stop) return { kind: 'stop' };
  return { kind: 'answer', text };
}

/** The prompt as the terminal shows it, line by line. */
export function renderOperatorPrompt(prompt: OperatorPrompt): string[] {
  const { field } = prompt;
  const facts = [fieldTypeOf(field), field.required ? 'required' : null].filter(
    (fact): fact is string => fact !== null,
  );
  const lines = [
    '──── operator needed ────',
    `Field: ${quote(field.name)} (${facts.join(', ')})${field.context ? ` — ${field.context}` : ''}`,
  ];
  if (field.options !== null) lines.push(`Options: ${field.options.join(' | ')}`);
  if (field.maxLength !== null) lines.push(`At most ${field.maxLength} characters.`);
  lines.push(
    `Page: ${prompt.page}${prompt.task === null ? '' : ` · Unit of work: ${prompt.task}`}`,
  );
  lines.push(
    prompt.suggestion === null
      ? `No suggested value — ${prompt.why}`
      : `Suggested: ${quote(prompt.suggestion)} — not trusted: ${prompt.why}`,
  );
  lines.push(
    `Type the answer, or fill the field in the browser and press Enter to read it back; ${OPERATOR_COMMANDS.blank} leaves it empty; ${OPERATOR_COMMANDS.stop} ends the session.`,
  );
  return lines;
}

/** One readline per question: opened, asked, closed, so stdin is held only while a person is typing. */
export const readlineIo = (): TerminalIo => ({
  async question(prompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await rl.question(prompt);
    } finally {
      rl.close();
    }
  },
  write(text) {
    process.stdout.write(`${text}\n`);
  },
});

export class TerminalOperator implements OperatorPort {
  constructor(private readonly io: TerminalIo = readlineIo()) {}

  async ask(prompt: OperatorPrompt): Promise<OperatorReply> {
    this.io.write(renderOperatorPrompt(prompt).join('\n'));
    return replyOf(await this.io.question(OPERATOR_PROMPT));
  }

  notify(text: string): void {
    this.io.write(text);
  }

  async pause(text: string): Promise<void> {
    this.io.write(text);
    await this.io.question(CONTINUE_PROMPT);
  }
}
