import { fieldSpecOf, formObservation, PROMPT_LIMITS, type FieldSpec } from '@sysdesign/contracts';

import {
  fieldQuestion,
  fieldReplyOf,
  pauseQuestion,
  type OperatorPrompt,
} from './operator-interaction';

const ASKING = {
  origin: { kind: 'browser-session', id: 's1', label: 'step 3 · Senior Engineer at Acme' },
  expiresAt: new Date('2026-10-12T00:00:00Z'),
};

/** A field of the form fixture, by ref. */
const fieldOf = (ref: string): FieldSpec => {
  const element = formObservation().elements.find((candidate) => candidate.ref === ref);
  if (element === undefined) throw new Error(`the form fixture has no ${ref}`);
  return fieldSpecOf(element);
};

const promptOf = (field: FieldSpec, untrusted: string | null): OperatorPrompt => ({
  field,
  untrusted,
  why: 'low confidence: a guess',
  task: 'Senior Engineer at Acme',
  page: 'Apply',
});

const answer = (reply: unknown) =>
  ({
    promptId: '00000000-0000-4000-8000-000000000000',
    reply,
    via: { channel: 'telegram', ref: 'm1' },
  }) as Parameters<typeof fieldReplyOf>[1];

describe('a field put to the operator', () => {
  it('[BRW-11] offers a closed list as its options alone, the answerer’s pick marked, and takes no words', () => {
    const { question, values } = fieldQuestion(promptOf(fieldOf('e2'), 'Yes'), ASKING);
    expect(question.prompt).toMatchObject({
      origin: ASKING.origin,
      title: 'Work authorisation',
      choices: [
        {
          id: 'c1',
          label: 'Yes',
          note: "the answerer's pick — not trusted: low confidence: a guess",
        },
        { id: 'c2', label: 'No', note: null },
      ],
      freeText: null,
      commands: [
        { id: 'readback', label: 'I filled it in the browser: read it back' },
        { id: 'blank', label: 'Leave it empty' },
        { id: 'stop', label: 'End the session' },
      ],
      expiresAt: '2026-10-12T00:00:00.000Z',
    });
    expect(question.enter).toBe('readback');
    expect(fieldReplyOf({ question, values }, answer({ kind: 'choice', choiceId: 'c2' }))).toEqual({
      reply: { kind: 'answer', text: 'No' },
      chosen: 'option',
    });
  });

  it('[BRW-11] takes words beside the options of a list cut short, and says how many more there are', () => {
    const field = { ...fieldOf('e2'), optionsOmitted: 40 };
    const { question } = fieldQuestion(promptOf(field, null), ASKING);
    expect(question.prompt.freeText).toEqual({ maxLength: null });
    expect(question.prompt.details).toContain(
      '40 more options are not listed: type the one you mean',
    );
    expect(question.prompt.details).toContain('No suggested value — low confidence: a guess');
  });

  it('[BRW-11] offers a field with no options the answerer’s value as a choice, fills its whole value, and reads words, commands, and nothing it never offered', () => {
    const long = 'x'.repeat(PROMPT_LIMITS.choiceLabelMaxLength + 50);
    const field = { ...fieldOf('e1'), maxLength: 50_000 };
    const asked = fieldQuestion(promptOf(field, long), ASKING);
    expect(asked.question.prompt.choices).toEqual([
      expect.objectContaining({
        id: 'c1',
        note: "the answerer's value — not trusted: low confidence: a guess",
      }),
    ]);
    expect(asked.question.prompt.choices[0]?.label).toHaveLength(
      PROMPT_LIMITS.choiceLabelMaxLength,
    );
    expect(asked.question.prompt.freeText).toEqual({ maxLength: PROMPT_LIMITS.answerMaxLength });
    expect(fieldReplyOf(asked, answer({ kind: 'choice', choiceId: 'c1' }))).toEqual({
      reply: { kind: 'answer', text: long },
      chosen: 'answerer',
    });
    expect(fieldReplyOf(asked, answer({ kind: 'text', text: '7' }))).toEqual({
      reply: { kind: 'answer', text: '7' },
      chosen: 'typed',
    });
    expect(fieldReplyOf(asked, answer({ kind: 'command', commandId: 'readback' })).reply).toEqual({
      kind: 'read-back',
    });
    expect(fieldReplyOf(asked, answer({ kind: 'command', commandId: 'stop' })).reply).toEqual({
      kind: 'stop',
    });
    expect(() => fieldReplyOf(asked, answer({ kind: 'choice', choiceId: 'c9' }))).toThrow(
      'the answer names choice c9, which the question never offered',
    );
  });

  it('[BRW-11] puts a wait to the operator as a question answered by going on', () => {
    expect(pauseQuestion('Sign in, then continue.', ASKING)).toMatchObject({
      prompt: {
        details: ['Sign in, then continue.'],
        choices: [],
        freeText: null,
        commands: [{ id: 'continue' }],
      },
      enter: 'continue',
    });
  });
});
