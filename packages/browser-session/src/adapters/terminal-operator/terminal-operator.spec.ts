import { PassThrough } from 'node:stream';

import { fieldSpecOf, formObservation } from '@sysdesign/contracts';

import { fieldQuestion } from '../../core/operator-interaction';
import { OperatorInterrupted, QuestionWithdrawn, type OperatorQuestion } from '../../core/ports';
import {
  OPERATOR_PROMPT,
  renderQuestion,
  TerminalOperator,
  terminalIo,
  type TerminalIo,
} from './terminal-operator';

const asked = (): OperatorQuestion =>
  fieldQuestion(
    {
      field: fieldSpecOf(formObservation().elements[1]),
      untrusted: 'Yes',
      why: 'low confidence: a guess',
      task: 'Senior Engineer at Acme',
      page: 'Apply — additional questions',
      suggestions: [],
    },
    {
      origin: { kind: 'browser-session', id: 's1', label: 'step 3 · Senior Engineer at Acme' },
      expiresAt: new Date('2026-10-12T00:00:00Z'),
    },
  ).question;

/** A terminal that types from a list, and records what was written and asked. */
const terminal = (lines: string[]) => {
  const written: string[] = [];
  const prompts: string[] = [];
  const io: TerminalIo = {
    question: async (text, signal) => {
      prompts.push(text);
      if (signal?.aborted === true) throw new QuestionWithdrawn('the terminal');
      return lines.shift() ?? '';
    },
    write: (text) => {
      written.push(text);
    },
    close: () => undefined,
  };
  return { io, written, prompts, operator: new TerminalOperator(io) };
};

describe('the terminal operator', () => {
  it('[BRW-11] shows the field the way every channel does: its options lettered, the answerer’s pick marked, its commands', () => {
    const question = asked();
    expect(renderQuestion(question)).toEqual([
      '──── operator needed ────',
      'Work authorisation',
      'select, required',
      'Are you authorised to work in this country?',
      'Page: Apply — additional questions',
      'Unit of work: Senior Engineer at Acme',
      'Suggested: "Yes" — not trusted: low confidence: a guess',
      '',
      "  a) Yes   (the answerer's pick — not trusted: low confidence: a guess)",
      '  b) No',
      '',
      '  /readback  I filled it in the browser: read it back   (Enter alone)',
      '  /blank     Leave it empty',
      '  /stop      End the session',
      'Reply with a letter (a, b) or the option as written, or /readback, /blank, /stop.',
    ]);
  });

  it('[BRW-11] reads a letter, an option as the list spells it, Enter and a command, and asks again after a reply it refuses', async () => {
    const { operator, written, prompts } = terminal(['maybe', 'B', 'no', '', '/stop']);
    const question = asked();
    const choice = (id: string) =>
      expect.objectContaining({ reply: { kind: 'choice', choiceId: id } });
    expect(await operator.ask(question)).toEqual(choice('c2'));
    expect(written[1]).toBe(
      '"maybe" is none of the choices. Reply with a letter (a, b) or the option as written, or /readback, /blank, /stop.',
    );
    expect(prompts).toEqual([OPERATOR_PROMPT, OPERATOR_PROMPT]);
    expect(await operator.ask(question)).toEqual(choice('c2'));
    expect(await operator.ask(question)).toMatchObject({
      reply: { kind: 'command', commandId: 'readback' },
      via: { channel: 'terminal' },
    });
    expect(await operator.ask(question)).toMatchObject({
      reply: { kind: 'command', commandId: 'stop' },
    });
  });

  it('[BRW-11] says who answered when the question is withdrawn, and when its own answer went unused', async () => {
    const { operator, written } = terminal([]);
    const withdrawn = new AbortController();
    withdrawn.abort({ reason: 'answered-elsewhere', note: 'answered via telegram: b: No' });
    await expect(operator.ask(asked(), withdrawn.signal)).rejects.toBeInstanceOf(QuestionWithdrawn);
    expect(written.at(-1)).toBe('── answered via telegram: b: No ──');
    await operator.unused(asked(), {
      reason: 'answered-elsewhere',
      note: 'answered via telegram: a: Yes',
    });
    expect(written.at(-1)).toBe('── not used: answered via telegram: a: Yes ──');
    operator.notify('step 3: form');
    expect(written.at(-1)).toBe('step 3: form');
  });

  it('[BRW-11] reads one line per open question, says a line typed with none open is unused, and turns Ctrl-C into an interruption', async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => input });
    const output = new PassThrough();
    const shown: string[] = [];
    output.on('data', (chunk: Buffer) => shown.push(chunk.toString()));
    const io = terminalIo(input, output);

    const first = io.question('> ');
    input.write('yes\r');
    expect(await first).toBe('yes');
    // Typed with no question open: said, and not kept for the next question.
    input.write('stray\r');
    await new Promise((resolve) => setImmediate(resolve));
    expect(shown.join('')).toContain('(no question is open: that line was not used)');
    const second = io.question('> ');
    input.write('no\r');
    expect(await second).toBe('no');

    const leaving = new AbortController();
    const third = io.question('> ', leaving.signal);
    leaving.abort();
    await expect(third).rejects.toBeInstanceOf(QuestionWithdrawn);

    const fourth = io.question('> ');
    input.write('\x03');
    await expect(fourth).rejects.toBeInstanceOf(OperatorInterrupted);
    io.close();
  });
});
