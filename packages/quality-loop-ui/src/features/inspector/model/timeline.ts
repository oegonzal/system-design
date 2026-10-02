import type { IsoDateString } from '@sysdesign/contracts';

import type { InspectorAction, Provenance } from './action';
import { changesOf, type JsonChange } from './changes';
import { diffOf } from './differ';
import { reduce } from './reduce';
import { digest } from './signature';
import { emptyState, type InspectorState } from './state';

/**
 * The append-only log of what happened, with the state after each entry.
 *
 * Append-only is load-bearing rather than tidy. A reader who has scrolled back
 * to iteration 1 must not have the ground move under them when iteration 3
 * lands, so nothing in the log is ever rewritten: an action already recorded is
 * recognised by key and skipped, and an action that re-asserts a key with a
 * *different* payload is appended as a correction rather than edited in place.
 * Corrections should never fire for a finished iteration — the contract says an
 * iteration once recorded is final — which is exactly why they are visible when
 * they do.
 *
 * Selection is by key, never by position, so trimming the front of the log can
 * never move what a reader is looking at.
 *
 * Each entry also carries its own answer to "what did this change": the delta
 * is computed and decoded once, here, when the entry is appended — never per
 * render. The clock-free version is computed alongside it rather than on demand,
 * because a reader toggling "ignore timings" is comparing the two and should not
 * wait for a thousand diffs to find out.
 */

/** The log's bound. Past it the oldest entries fold into the baseline state. */
export const MAX_ACTIONS = 2000;

export interface TimelineEntry {
  /** Position in the whole history, including entries already trimmed. Never reused. */
  ordinal: number;
  action: InspectorAction;
  provenance: Provenance;
  /** The wire's own timestamp when it carries one, else when this poll observed it, else null. */
  at: IsoDateString | null;
  /** True when this entry re-asserts a key the log already held, with a different payload. */
  corrected: boolean;
  /** The state after this action. */
  after: InspectorState;
  /** What this action changed, decoded once when it was appended. */
  changes: readonly JsonChange[];
  /** The same, with the fields that only say *when* set aside. */
  untimedChanges: readonly JsonChange[];
}

export interface Timeline {
  entries: readonly TimelineEntry[];
  /**
   * The state the first retained entry was applied to. `emptyState()` until
   * trimming begins, and the trimmed prefix's result afterwards — which is what
   * keeps the first retained entry's diff correct rather than diffed against
   * nothing.
   */
  baseline: InspectorState;
  /** Every key ever recorded against the payload last seen for it, trimmed ones included. */
  signatures: ReadonlyMap<string, string>;
  /** How many entries have been trimmed from the front. */
  dropped: number;
}

export const emptyTimeline = (): Timeline => ({
  entries: [],
  baseline: emptyState(),
  signatures: new Map(),
  dropped: 0,
});

/** The state an entry was applied to — the one before it, or the baseline. */
export const beforeOf = (timeline: Timeline, index: number): InspectorState =>
  index <= 0 ? timeline.baseline : timeline.entries[index - 1].after;

/** The state after everything recorded so far. */
export const latestState = (timeline: Timeline): InspectorState =>
  timeline.entries.length === 0
    ? timeline.baseline
    : timeline.entries[timeline.entries.length - 1].after;

export const entryByKey = (timeline: Timeline, key: string | null): number =>
  key === null ? -1 : timeline.entries.findIndex((entry) => entry.action.key === key);

/** What an action asserts, independent of the key it asserts it under. */
const payloadSignature = (action: InspectorAction): string => {
  const { key: _key, ...rest } = action;
  return digest(rest);
};

export interface RecordOptions {
  /**
   * Whether these actions were read out of a snapshot the reader was handed
   * (`reconstructed`) or revealed by a poll while watching (`recorded`).
   */
  provenance: Provenance;
  /** When this observation was made. Used only where the wire carries no time of its own. */
  observedAt?: IsoDateString | null;
  max?: number;
}

/**
 * Append whatever is new. An action already in the log by key and payload is
 * not recorded twice; one whose payload changed is recorded again as a
 * correction under its own key, so history is added to and never rewritten.
 */
export function recordActions(
  timeline: Timeline,
  actions: readonly InspectorAction[],
  { provenance, observedAt = null, max = MAX_ACTIONS }: RecordOptions,
): Timeline {
  const entries = [...timeline.entries];
  const signatures = new Map(timeline.signatures);
  let ordinal = timeline.dropped + entries.length;
  let state = entries.length === 0 ? timeline.baseline : entries[entries.length - 1].after;
  let changed = false;

  for (const action of actions) {
    const signature = payloadSignature(action);
    const seen = signatures.get(action.key);
    if (seen === signature) continue;
    const corrected = seen !== undefined;
    const key = corrected ? `${action.key}@${ordinal}` : action.key;
    const recorded = corrected ? { ...action, key } : action;
    const before = state;
    state = reduce(before, recorded);
    entries.push({
      ordinal,
      action: recorded,
      provenance,
      at: action.at ?? observedAt,
      corrected,
      after: state,
      changes: changesOf(diffOf(before, state), before, state),
      untimedChanges: changesOf(diffOf(before, state, true), before, state),
    });
    signatures.set(action.key, signature);
    if (corrected) signatures.set(key, signature);
    ordinal += 1;
    changed = true;
  }

  if (!changed) return timeline;

  // Trim from the front, folding what is dropped into the baseline so the first
  // retained entry is still diffed against the state it actually followed.
  let baseline = timeline.baseline;
  let dropped = timeline.dropped;
  if (entries.length > max) {
    const cut = entries.length - max;
    baseline = entries[cut - 1].after;
    dropped += cut;
    entries.splice(0, cut);
  }

  return { entries, baseline, signatures, dropped };
}
