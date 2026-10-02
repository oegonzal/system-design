/**
 * A recall as a run records it: what `recallMemory` came to, in the run
 * recall's closed vocabulary, and each usable memory as the lesson the
 * producer is handed — the curator's words beside the stored lesson, and the
 * run it came from, so what a producer saw can be audited against the store.
 */
import {
  recallOf,
  recallWithout,
  withRecallFocus,
  type RecalledLessonDto,
  type RecallFocusDto,
  type RunRecallDto,
} from '@sysdesign/contracts';

import type { Recalled } from './recall-memory';
import type { UsableMemory } from './read-pack';

export const lessonOf = ({ alias, kept, hit }: UsableMemory): RecalledLessonDto => ({
  ref: alias,
  serves: kept.serves,
  insight: kept.insight,
  caveat: kept.caveat,
  text: hit.text,
  sourceRunId: hit.source.runId,
});

/**
 * The run's record of a recall: recalled with its lessons, or empty or
 * skipped with the reason — with the defects it searched for beside the
 * prompt, when it was focused on any.
 */
export function provenanceOf(
  recalled: Recalled,
  focus: RecallFocusDto | null = null,
): RunRecallDto {
  return withRecallFocus(outcomeOf(recalled), focus);
}

function outcomeOf(recalled: Recalled): RunRecallDto {
  switch (recalled.status) {
    case 'skipped':
      return recallWithout(recalled.reason, recalled.note);
    case 'failed':
      return recallWithout(recalled.reason, recalled.note, recalled.runId);
    case 'complete':
      return recalled.reason === null
        ? recallOf(recalled.usable.map(lessonOf), recalled.runId)
        : recallWithout(recalled.reason, null, recalled.runId);
  }
}
