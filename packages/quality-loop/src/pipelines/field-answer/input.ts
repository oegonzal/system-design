/**
 * The input codec of the field-answer pipeline. The goal is composed by the
 * browser session with the contracts codec (`composeFieldGoal`) — the
 * mission's answering policy, the fields of one form page, the evidence
 * recalled about the applicant — and recomposed by the form-memory
 * orchestrator once the evidence is in. The validators read the index back
 * here through the engine's own fence reader, pinned equal to the composer's
 * by the browser-step input spec.
 */
import {
  FIELD_ANSWER_PIPELINE_ID,
  fieldIndexSchema,
  type FieldIndex,
  readFencedIndex,
} from '@sysdesign/contracts';

export { FIELD_ANSWER_PIPELINE_ID };
export type { FieldIndex };

/** The index the composer wrote, or null for a goal that is not a field-answer goal. */
export const readIndex = (goal: string): FieldIndex | null =>
  readFencedIndex(goal, fieldIndexSchema);
