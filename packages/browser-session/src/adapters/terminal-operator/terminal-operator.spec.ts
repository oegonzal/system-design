import { fieldSpecOf, formObservation } from '@sysdesign/contracts';

import type { OperatorPrompt } from '../../core/ports';
import {
  CONTINUE_PROMPT,
  OPERATOR_COMMANDS,
  OPERATOR_PROMPT,
  renderOperatorPrompt,
  replyOf,
  TerminalOperator,
  type TerminalIo,
} from './terminal-operator';

const prompt = (): OperatorPrompt => ({
  field: fieldSpecOf(formObservation().elements[1]),
  suggestion: 'Yes',
  why: 'low confidence: a guess — ungrounded: no evidence names the country',
  task: 'Senior Engineer at Acme',
  page: 'Apply — additional questions',
});

const terminal = (lines: string[]) => {
  const written: string[] = [];
  const asked: string[] = [];
  const io: TerminalIo = {
    question: async (text) => {
      asked.push(text);
      return lines.shift() ?? '';
    },
    write: (text) => written.push(text),
  };
  return { io, written, asked, operator: new TerminalOperator(io) };
};

describe('the terminal operator', () => {
  it('[BRW-3] shows the field, its question, the suggested value and why it was not trusted, then reads the reply', async () => {
    const { operator, written, asked } = terminal(['No']);
    expect(await operator.ask(prompt())).toEqual({ kind: 'answer', text: 'No' });
    expect(asked).toEqual([OPERATOR_PROMPT]);
    const lines = renderOperatorPrompt(prompt());
    expect(written[0]).toBe(lines.join('\n'));
    expect(lines[1]).toBe(
      'Field: "Work authorisation" (select, required) — Are you authorised to work in this country?',
    );
    expect(lines[2]).toBe('Options: Yes | No');
    expect(lines).toContain(
      'Page: Apply — additional questions · Unit of work: Senior Engineer at Acme',
    );
    expect(lines).toContain(
      'Suggested: "Yes" — not trusted: low confidence: a guess — ungrounded: no evidence names the country',
    );
    expect(lines[lines.length - 1]).toContain(OPERATOR_COMMANDS.blank);
    expect(lines[lines.length - 1]).toContain(OPERATOR_COMMANDS.stop);
    expect(renderOperatorPrompt({ ...prompt(), suggestion: null, task: null })).toContain(
      'No suggested value — low confidence: a guess — ungrounded: no evidence names the country',
    );
  });

  it('[BRW-3] reads an empty Enter as "read the field back", and the two commands as themselves', async () => {
    expect(replyOf('')).toEqual({ kind: 'read-back' });
    expect(replyOf('   ')).toEqual({ kind: 'read-back' });
    expect(replyOf(OPERATOR_COMMANDS.blank)).toEqual({ kind: 'blank' });
    expect(replyOf(` ${OPERATOR_COMMANDS.stop} `)).toEqual({ kind: 'stop' });
    expect(replyOf('  6 years ')).toEqual({ kind: 'answer', text: '6 years' });
    const { operator } = terminal(['', '/blank', '/stop']);
    expect(await operator.ask(prompt())).toEqual({ kind: 'read-back' });
    expect(await operator.ask(prompt())).toEqual({ kind: 'blank' });
    expect(await operator.ask(prompt())).toEqual({ kind: 'stop' });
  });

  it('notifies without waiting and pauses until Enter', async () => {
    const { operator, written, asked } = terminal(['']);
    operator.notify('step 3: form');
    expect(written).toEqual(['step 3: form']);
    expect(asked).toEqual([]);
    await operator.pause('Sign in, then press Enter.');
    expect(written[1]).toBe('Sign in, then press Enter.');
    expect(asked).toEqual([CONTINUE_PROMPT]);
  });
});
