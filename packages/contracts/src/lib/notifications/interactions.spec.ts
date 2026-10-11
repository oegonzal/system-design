import {
  choiceKey,
  describeReply,
  howToAnswer,
  interactionPromptSchema,
  readReply,
  type InteractionPrompt,
} from './interactions';
import { listedOptionOf } from '../text';

const prompt = (overrides: Partial<InteractionPrompt> = {}): InteractionPrompt => ({
  id: '0b7c6d6e-5b8f-4c3e-9a51-6f2f3b1e2a10',
  origin: { kind: 'browser-session', id: 's1', label: 'step 3 · Acme' },
  title: 'Gender',
  details: [],
  choices: [
    { id: 'male', label: 'Male', note: null },
    { id: 'female', label: 'Female', note: null },
    { id: 'decline', label: 'Decline to self identify', note: 'not trusted: no evidence' },
  ],
  freeText: null,
  commands: [
    { id: 'blank', label: 'Leave it empty' },
    { id: 'stop', label: 'End the session' },
  ],
  expiresAt: '2026-10-12T00:00:00.000Z',
  ...overrides,
});

describe('a prompt and the replies it takes', () => {
  it('[NTF-5] letters choices a…z, then aa, ab…', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(choiceKey)).toEqual([
      'a',
      'b',
      'z',
      'aa',
      'ab',
      'az',
      'ba',
      'zz',
      'aaa',
    ]);
  });

  it('[NTF-5] reads a key, case aside, a label as the list spells it, and a declared command', () => {
    const asked = prompt();
    expect(readReply(asked, 'b')).toEqual({
      kind: 'reply',
      reply: { kind: 'choice', choiceId: 'female' },
    });
    expect(readReply(asked, ' C ')).toEqual({
      kind: 'reply',
      reply: { kind: 'choice', choiceId: 'decline' },
    });
    expect(readReply(asked, 'female')).toEqual({
      kind: 'reply',
      reply: { kind: 'choice', choiceId: 'female' },
    });
    expect(readReply(asked, '/BLANK')).toEqual({
      kind: 'reply',
      reply: { kind: 'command', commandId: 'blank' },
    });
  });

  it('[NTF-5] names an option the list spells: the option itself, else the one equal to it but for case', () => {
    expect(listedOptionOf(['Yes', 'No'], 'Yes')).toBe('Yes');
    expect(listedOptionOf(['Yes', 'No'], ' yes ')).toBe('Yes');
    expect(listedOptionOf(['Yes', 'No'], 'NO')).toBe('No');
    expect(listedOptionOf(['Yes', 'No'], 'maybe')).toBeNull();
    // An exact option wins; two options equal but for case are named by neither fold.
    expect(listedOptionOf(['Yes', 'YES'], 'YES')).toBe('YES');
    expect(listedOptionOf(['Yes', 'YES'], 'yes')).toBeNull();
  });

  it('[NTF-5] refuses what a closed prompt does not take, saying how it is answered, and keeps a key ahead of the words', () => {
    const asked = prompt();
    expect(readReply(asked, 'maybe')).toEqual({
      kind: 'refused',
      reason: '"maybe" is none of the choices. Reply with a letter (a, b, c), or /blank, /stop.',
    });
    expect(readReply(asked, '/skip')).toMatchObject({
      kind: 'refused',
      reason: expect.stringMatching(/^\/skip is not a command here\./),
    });
    expect(readReply(asked, '   ')).toMatchObject({
      kind: 'refused',
      reason: expect.stringMatching(/^Nothing was typed\./),
    });

    // A prompt that takes words still reads a key as its choice.
    const open = prompt({
      choices: [{ id: 's1', label: 'Six years of Node.js services', note: 'from your record' }],
      freeText: { maxLength: 20 },
    });
    expect(readReply(open, 'a')).toEqual({
      kind: 'reply',
      reply: { kind: 'choice', choiceId: 's1' },
    });
    expect(readReply(open, 'Eight years')).toEqual({
      kind: 'reply',
      reply: { kind: 'text', text: 'Eight years' },
    });
    expect(readReply(open, 'x'.repeat(21))).toEqual({
      kind: 'refused',
      reason:
        'That is 21 characters, and at most 20 fit. Reply with a letter (a), or your own answer (at most 20 characters), or /blank, /stop.',
    });
  });

  it('[NTF-5] lists many keys as a range, and describes a reply against its prompt', () => {
    const long = prompt({
      choices: Array.from({ length: 30 }, (_, index) => ({
        id: `o${index}`,
        label: `Option ${index}`,
        note: null,
      })),
      commands: [],
    });
    expect(howToAnswer(long)).toBe('Reply with a letter (a–ad).');
    expect(readReply(long, 'ad')).toEqual({
      kind: 'reply',
      reply: { kind: 'choice', choiceId: 'o29' },
    });

    const asked = prompt();
    expect(describeReply(asked, { kind: 'choice', choiceId: 'female' })).toBe('b: Female');
    expect(describeReply(asked, { kind: 'command', commandId: 'blank' })).toBe(
      '/blank (Leave it empty)',
    );
    expect(describeReply(asked, { kind: 'text', text: 'Prefer\nnot  to say' })).toBe(
      '"Prefer not to say"',
    );
  });

  it('[NTF-5] refuses a prompt that names a choice twice, or offers no way to answer', () => {
    expect(interactionPromptSchema.safeParse(prompt()).success).toBe(true);
    const twice = prompt({
      choices: [
        { id: 'x', label: 'One', note: null },
        { id: 'x', label: 'Two', note: null },
      ],
    });
    expect(interactionPromptSchema.safeParse(twice).success).toBe(false);
    expect(
      interactionPromptSchema.safeParse(prompt({ choices: [], freeText: null, commands: [] }))
        .success,
    ).toBe(false);
  });
});
