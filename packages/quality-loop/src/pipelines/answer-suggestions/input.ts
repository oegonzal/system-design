/**
 * The input codec of the answer-suggestions pipeline: the form codec's goal
 * (`composeFieldGoal`) written for this pipeline — the mission, the fields
 * the operator is about to be asked, the evidence recalled about the subject
 * — read back through the engine's own fence reader. A goal written for
 * another form pipeline reads as none.
 */
import {
  ANSWER_SUGGESTIONS_PIPELINE_ID,
  fieldIndexSchemaFor,
  readFencedIndex,
  type FieldIndex,
} from '@sysdesign/contracts';

const suggestionsIndexSchema = fieldIndexSchemaFor(ANSWER_SUGGESTIONS_PIPELINE_ID);

/** The index the composer wrote, or null for a goal that is not an answer-suggestions goal. */
export const readIndex = (goal: string): FieldIndex | null =>
  readFencedIndex(goal, suggestionsIndexSchema);
