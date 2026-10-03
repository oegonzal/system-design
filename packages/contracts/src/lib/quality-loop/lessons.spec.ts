import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { bounded, CUT_FACTOR, parseLenient } from '../bounds';
import {
  LESSON_APPLIES_WHEN_BOUND,
  LESSON_CHUNK_BOUND,
  LESSON_INSIGHT_BOUND,
  LESSON_SEPARATOR,
  lessonText,
} from './lessons';

/** The two halves as a digest's reply declares them, and the chunk as the recall query does. */
const halves = z.strictObject({
  insight: bounded.text(LESSON_INSIGHT_BOUND, { min: 1 }),
  appliesWhen: bounded.text(LESSON_APPLIES_WHEN_BOUND, { min: 1 }),
});
const chunk = z.strictObject({ text: bounded.text(LESSON_CHUNK_BOUND, { min: 1 }) });

/** Prose of whole words, so a cut lands between two of them as it would on a reply. */
const prose = (length: number): string => 'word '.repeat(Math.ceil(length / 5)).slice(0, length);

describe('a stored lesson’s text', () => {
  it('[QL-58] is the two halves joined once, so halves at their targets or ceilings are a chunk at its own', () => {
    const at = (size: 'target' | 'ceiling') =>
      lessonText({
        insight: prose(LESSON_INSIGHT_BOUND[size]),
        appliesWhen: prose(LESSON_APPLIES_WHEN_BOUND[size]),
      });
    expect(at('target')).toHaveLength(LESSON_CHUNK_BOUND.target);
    expect(at('ceiling')).toHaveLength(LESSON_CHUNK_BOUND.ceiling);
    expect(at('target').split(LESSON_SEPARATOR)).toHaveLength(2);
  });

  it('[QL-58] a lesson a digest kept — each half up to its cut — is a chunk a lenient read keeps whole', () => {
    // Far past every cut: the digest's own read cuts each half at a word with the marker.
    const reply = parseLenient(halves, {
      insight: prose(CUT_FACTOR * LESSON_INSIGHT_BOUND.target * 2),
      appliesWhen: prose(CUT_FACTOR * LESSON_APPLIES_WHEN_BOUND.target * 2),
    });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    expect(reply.overruns.map((overrun) => overrun.handling)).toEqual(['cut', 'cut']);

    const read = parseLenient(chunk, { text: lessonText(reply.value) });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.text).toBe(lessonText(reply.value));
    expect(read.overruns).toEqual([
      expect.objectContaining({ path: 'text', handling: 'kept-over-ceiling' }),
    ]);
  });
});
