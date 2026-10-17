import { interactionPromptSchema, PROMPT_LIMITS } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { NOTED, notedPrompt } from './noted-prompt';

describe('a notice as a prompt', () => {
  it('[NTC-3] offers one Noted choice and nothing else to answer, and cuts every line to the prompt limits so the bus never refuses it', () => {
    const prompt = notedPrompt({
      origin: { kind: 'example', id: 'x1', label: 'an example' },
      title: 't'.repeat(PROMPT_LIMITS.titleMaxLength + 50),
      details: Array.from({ length: PROMPT_LIMITS.details + 2 }, (_, i) =>
        `${i}`.padEnd(PROMPT_LIMITS.detailMaxLength + 10, 'd'),
      ),
      expiresAt: new Date('2026-10-17T00:00:00.000Z'),
    });
    expect(interactionPromptSchema.parse(prompt)).toEqual(prompt);
    expect(prompt.choices).toEqual([NOTED]);
    expect(prompt.freeText).toBeNull();
    expect(prompt.commands).toEqual([]);
    expect(prompt.title).toHaveLength(PROMPT_LIMITS.titleMaxLength);
    expect(prompt.details).toHaveLength(PROMPT_LIMITS.details);
    expect(prompt.details[0]).toHaveLength(PROMPT_LIMITS.detailMaxLength);
    expect(prompt.expiresAt).toBe('2026-10-17T00:00:00.000Z');
  });
});
