/**
 * A recall as a run records it: what `recallMemory` came to, in the run
 * recall's closed vocabulary, and each usable memory as the lesson the
 * producer is handed — the curator's words beside the stored lesson, and the
 * run, pipeline, iteration, decision and day it came from, so what a
 * producer saw can be audited against the store — with what its screen set
 * aside as already in hand, when it screened.
 *
 * The curator's query labelled the defects it was focused on `d1…`; a label
 * means nothing to the producer or the author, so the defects a kept chunk
 * cites are read back in the asker's terms — the criterion the asker fell
 * short on, or the defect's own words. The curator's words carry no label
 * (the pipeline refuses one), so they are handed on as written.
 */
import {
  recallOf,
  recallWithout,
  tokenWords,
  withRecallDeferred,
  withRecallFocus,
  withRecallNovelty,
  type RecalledLessonDto,
  type RecallFocusDto,
  type RunRecallDto,
} from '@sysdesign/contracts';

import { focusAlias } from '../../../pipelines/memory-recall/input';
import { focusLines } from './focus';
import { probeSet } from './query';
import type { Recalled } from './recall-memory';
import type { UsableMemory } from './read-pack';

/**
 * Each focus label as the query listed it — the focus lines kept the way the
 * search kept them, deduped, so `d3` is the third line the curator read —
 * with what it stands for: a criterion the asker fell short on is its own
 * id, a defect is its type in words.
 */
function focusTerms(focus: RecallFocusDto | null): ReadonlyMap<string, string> {
  if (focus === null) return new Map();
  const lines = focusLines(focus).map((line) => line.trim());
  const terms = [
    ...focus.findings.map((finding) => tokenWords(finding.type)),
    ...focus.criteria.map((criterion) => criterion.criterionId),
  ];
  // One line per finding, then per criterion: a line nobody could tell apart is no label at all.
  if (lines.length !== terms.length) return new Map();
  // The goal never repeats a focus line, so searching under none dedupes as the recall did.
  const listed = probeSet('', [], lines).focus;
  return new Map(
    listed.map((line, position) => [focusAlias(position), terms[lines.indexOf(line)]]),
  );
}

export const lessonOf = (
  { alias, kept, hit }: UsableMemory,
  focus: RecallFocusDto | null = null,
): RecalledLessonDto => {
  const terms = focusTerms(focus);
  const { runId, pipeline, iteration, decision, when } = hit.source;
  return {
    ref: alias,
    serves: kept.serves,
    answers: [...new Set(kept.cites.flatMap((label) => terms.get(label) ?? []))],
    insight: kept.insight,
    caveat: kept.caveat,
    text: hit.text,
    sourceRunId: runId,
    pipeline,
    iteration,
    decision,
    when,
  };
};

/**
 * The run's record of a recall: recalled with its lessons, or empty or
 * skipped with the reason — with the defects it searched for beside the
 * prompt, when it was focused on any, what it screened out, when it
 * screened, and how many hits the goal budget left out of the curator's
 * query, when one was curated.
 */
export function provenanceOf(
  recalled: Recalled,
  focus: RecallFocusDto | null = null,
): RunRecallDto {
  return withRecallDeferred(
    withRecallNovelty(withRecallFocus(outcomeOf(recalled, focus), focus), recalled.novelty ?? null),
    recalled.status === 'complete' ? recalled.counts.deferred : 0,
  );
}

function outcomeOf(recalled: Recalled, focus: RecallFocusDto | null): RunRecallDto {
  switch (recalled.status) {
    case 'skipped':
      return recallWithout(recalled.reason, recalled.note);
    case 'failed':
      return recallWithout(recalled.reason, recalled.note, recalled.runId);
    case 'complete':
      return recalled.reason === null
        ? recallOf(
            recalled.usable.map((usable) => lessonOf(usable, focus)),
            recalled.runId,
          )
        : recallWithout(recalled.reason, null, recalled.runId);
  }
}
