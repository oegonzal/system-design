import { bound, composedBound } from '../bounds';

/**
 * A stored lesson's text, declared once for everything that writes or reads
 * one: the two halves a digest proposes — the instruction and the condition
 * it applies under — and the chunk the store indexes and the curator is
 * handed, which is the two joined by one separator. The chunk bound is
 * composed from the halves, so a lesson a digest accepted always fits the
 * query that recalls it.
 */
export const LESSON_INSIGHT_BOUND = bound(1000);
export const LESSON_APPLIES_WHEN_BOUND = bound(500);
export const LESSON_SEPARATOR = ' — applies when ';
export const LESSON_CHUNK_BOUND = composedBound([
  LESSON_INSIGHT_BOUND,
  LESSON_SEPARATOR,
  LESSON_APPLIES_WHEN_BOUND,
]);

/** The one text of a lesson: as a digest renders it for its judges, and as the store keeps it. */
export const lessonText = (memory: { insight: string; appliesWhen: string }): string =>
  `${memory.insight}${LESSON_SEPARATOR}${memory.appliesWhen}`;
