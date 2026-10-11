import { promptOf } from '../testing';
import { closedPart, renderPrompt, TELEGRAM_TEXT_MAX } from './render';

const LIMITS = { maxChoiceButtons: 4, buttonsPerRow: 3 };

describe('a prompt as Telegram messages', () => {
  it('[NTF-8] escapes the HTML, letters the choices with their notes, says how it is answered, and puts a button per letter and per command', () => {
    const { parts, keyboard } = renderPrompt(
      promptOf({
        title: 'Q <1> & 2',
        details: ['Page: Acme & Co'],
        choices: [
          { id: 'yes', label: 'Yes', note: 'from your record' },
          { id: 'no', label: 'No <never>', note: null },
        ],
      }),
      LIMITS,
    );
    expect(parts).toEqual([
      [
        '<b>Q &lt;1&gt; &amp; 2</b>',
        '<i>step 3 · Acme</i>',
        'Page: Acme &amp; Co',
        '',
        '<b>a</b> — Yes <i>(from your record)</i>',
        '<b>b</b> — No &lt;never&gt;',
        '',
        'Reply with a letter (a, b), or /blank.',
      ].join('\n'),
    ]);
    // A button sends exactly what typing it would.
    expect(keyboard).toEqual([
      [
        { text: 'a', callback_data: 'a' },
        { text: 'b', callback_data: 'b' },
      ],
      [{ text: 'Leave it empty', callback_data: '/blank' }],
    ]);
  });

  it('[NTF-8] rows the letters, leaves them to be typed past the declared count, and keeps every button within Telegram’s 64 bytes', () => {
    const many = (count: number) =>
      promptOf({
        choices: Array.from({ length: count }, (_, index) => ({
          id: `o${index}`,
          label: `Option ${index}`,
          note: null,
        })),
        commands: [{ id: 'a_command_named_as_long_as_allowed', label: 'x'.repeat(300) }],
      });
    const rowed = renderPrompt(many(4), LIMITS).keyboard ?? [];
    expect(rowed.map((row) => row.map((button) => button.text))).toEqual([
      ['a', 'b', 'c'],
      ['d'],
      [`${'x'.repeat(63)}…`],
    ]);
    const typed = renderPrompt(many(30), LIMITS);
    expect(typed.keyboard?.flat().map((button) => button.callback_data)).toEqual([
      '/a_command_named_as_long_as_allowed',
    ]);
    expect(typed.parts.join('\n')).toContain('<b>ad</b> — Option 29');
    for (const button of [...rowed.flat(), ...(typed.keyboard ?? []).flat()]) {
      expect(Buffer.byteLength(button.callback_data)).toBeLessThanOrEqual(64);
    }
  });

  it('[NTF-8] fits a long prompt into parts within the message limit with room for its outcome, cutting nothing inside a tag or an entity', () => {
    const prompt = promptOf({
      details: Array.from({ length: 12 }, () => 'd'.repeat(900)),
      choices: [
        { id: 'amp', label: '&'.repeat(2_000), note: 'every character escaped' },
        { id: 'plain', label: 'Plain', note: null },
      ],
    });
    const { parts } = renderPrompt(prompt, LIMITS);
    expect(parts.length).toBeGreaterThan(3);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(TELEGRAM_TEXT_MAX - 600);
      expect(part).not.toMatch(/&(?!amp;|lt;|gt;)/);
      expect(part.match(/<b>/g)?.length ?? 0).toBe(part.match(/<\/b>/g)?.length ?? 0);
    }
    expect(parts.join('').replaceAll('\n', '')).toContain('&amp;'.repeat(2_000));

    const closed = closedPart(prompt, LIMITS, 'Answered: b: Plain <yes>');
    expect(closed.startsWith(parts[parts.length - 1] ?? '')).toBe(true);
    expect(closed.endsWith('\n\n<b>Answered: b: Plain &lt;yes&gt;</b>')).toBe(true);
    expect(closed.length).toBeLessThanOrEqual(TELEGRAM_TEXT_MAX);
  });
});
