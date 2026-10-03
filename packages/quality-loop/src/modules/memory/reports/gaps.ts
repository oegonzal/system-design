/**
 * What recalls could not serve, by brief.
 *
 * Every memory-recall run ends by naming the needs of its query no candidate
 * informed. It is a judged field — the coverage evaluator fails a gap a dropped
 * candidate could have served — so a gap that stands is a reasonably trustworthy
 * statement that the store held nothing. Measured over the recorded recalls, a
 * median of five per run, and every one of them discarded: the pack is written,
 * read for its kept chunks, and the gaps go nowhere.
 *
 * Keeping them turns "the store grew" into "the store now covers what recall
 * asked for". A gap named four times across four recalls of one brief, with a
 * digest in between that stored nothing about it, is the clearest signal the
 * corpus can produce about what to learn next — and nothing in the system knew
 * it.
 *
 * A gap belongs to a brief, not to a recall: the same prompt recalled twice
 * groups once, under the hash of its bare goal. Pure over records already
 * written; the service does the paging.
 */
import { createHash } from 'node:crypto';

import type { GapDto, GapGroupDto, QualityRunDto, StandingGapsDto } from '@sysdesign/contracts';

import { memoryPackSchema } from '../../../pipelines/memory-recall/output';
import { bareGoal } from '../../../orchestrators/memory/recall/inject';

/** A recall run with the brief it was run for, when that could be established. */
export interface AttributedRecall {
  recall: QualityRunDto;
  /** The goal of the run the recall served, taken bare; null when it cannot be resolved. */
  goal: string | null;
}

/** The hash a brief groups under: sha256 of the goal with any appended memory stripped. */
export const goalHashOf = (goal: string): string =>
  createHash('sha256').update(bareGoal(goal), 'utf8').digest('hex');

/** The first line or so of a brief, for a reader of the group. */
const headOf = (goal: string): string => {
  const bare = bareGoal(goal).trim();
  return bare.length <= 200 ? bare : `${bare.slice(0, 199)}…`;
};

/**
 * The gaps one recall named, minus any its own critics faulted. A gap the
 * coverage evaluator judged badly is the pack's opinion rather than the store's
 * shortcoming, and the pack's locations are where a finding says so.
 */
export function gapsOf(recall: QualityRunDto): string[] {
  const trace = recall.trace;
  if (trace === null) return [];
  const best =
    trace.iterations.find((iteration) => iteration.iteration === trace.bestIteration) ??
    trace.iterations[trace.iterations.length - 1];
  if (best === undefined) return [];
  const pack = memoryPackSchema.safeParse(best.artifact);
  if (!pack.success) return [];
  const faulted = new Set(best.ledger.findings.flatMap((finding) => finding.locationRefs));
  return pack.data.gaps.filter((_, position) => !faulted.has(`gap.${position + 1}`));
}

/** When a recall ran, for the first and last a gap was named. */
const whenOf = (recall: QualityRunDto): string => recall.finishedAt ?? recall.startedAt;

/**
 * Every gap of every attributed recall, grouped by brief, each gap naming the
 * recalls that named it. Deduped on the exact text: two wordings of one need are
 * two gaps here, which is honest — clustering them needs embeddings and this
 * report writes nothing.
 */
export function standingGaps(
  recalls: readonly AttributedRecall[],
  scanned: number,
): StandingGapsDto {
  const groups = new Map<string, { goal: string; recalls: number; gaps: Map<string, GapDto> }>();
  let unattributed = 0;
  for (const entry of recalls) {
    if (entry.goal === null) {
      unattributed += 1;
      continue;
    }
    const hash = goalHashOf(entry.goal);
    const group = groups.get(hash) ?? { goal: entry.goal, recalls: 0, gaps: new Map() };
    group.recalls += 1;
    const when = whenOf(entry.recall);
    for (const text of gapsOf(entry.recall)) {
      const gap = group.gaps.get(text);
      group.gaps.set(
        text,
        gap === undefined
          ? { text, namedIn: [entry.recall.runId], first: when, last: when }
          : {
              ...gap,
              namedIn: [...gap.namedIn, entry.recall.runId],
              first: when < gap.first ? when : gap.first,
              last: when > gap.last ? when : gap.last,
            },
      );
    }
    groups.set(hash, group);
  }
  return {
    scanned,
    unattributed,
    groups: [...groups.entries()]
      .map(([goalHash, group]): GapGroupDto => ({
        goalHash,
        goalHead: headOf(group.goal),
        recalls: group.recalls,
        // Most-named first: what the store has failed to serve most often.
        gaps: [...group.gaps.values()].sort(
          (a, b) => b.namedIn.length - a.namedIn.length || a.text.localeCompare(b.text),
        ),
      }))
      .sort((a, b) => b.gaps.length - a.gaps.length || a.goalHash.localeCompare(b.goalHash)),
  };
}
