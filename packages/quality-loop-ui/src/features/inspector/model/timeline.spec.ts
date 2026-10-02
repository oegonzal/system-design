import { describe, expect, it } from 'vitest';

import { makeRun, makeTwoIterationRun } from '../../../testing/fixtures';
import type { InspectorAction } from './action';
import { changesOf } from './changes';
import { deriveRun } from './derive-run';
import { diffOf } from './differ';
import {
  beforeOf,
  emptyTimeline,
  entryByKey,
  latestState,
  recordActions,
  type Timeline,
} from './timeline';

const OBSERVED = '2026-09-06T00:06:00.000Z';

const reconstruct = (actions: readonly InspectorAction[], timeline = emptyTimeline()): Timeline =>
  recordActions(timeline, actions, { provenance: 'reconstructed' });

const observe = (timeline: Timeline, actions: readonly InspectorAction[]): Timeline =>
  recordActions(timeline, actions, { provenance: 'recorded', observedAt: OBSERVED });

describe('the append-only log', () => {
  it('[QLU-8] a snapshot the reader was handed is reconstructed; a poll’s new actions are recorded', () => {
    const open = makeRun({ status: 'running', finishedAt: null, trace: null });
    const first = reconstruct(deriveRun(open));
    expect(first.entries.every((entry) => entry.provenance === 'reconstructed')).toBe(true);

    const second = observe(first, deriveRun(makeTwoIterationRun()));
    const fresh = second.entries.slice(first.entries.length);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((entry) => entry.provenance === 'recorded')).toBe(true);
    // Everything already in the log keeps the provenance it was recorded under.
    expect(second.entries.slice(0, first.entries.length)).toEqual(first.entries);
  });

  it('[QLU-8] an action that carries the wire’s own time keeps it; only the rest take the poll’s', () => {
    const timeline = observe(emptyTimeline(), deriveRun(makeRun()));
    const opened = timeline.entries[0];
    expect(opened.at).toBe('2026-09-06T00:00:00.000Z');
    const ledger = timeline.entries.find((entry) => entry.action.type === 'ledger/normalised');
    // The wire carries no time for a normalisation, so this is honestly the
    // moment it was observed and not a claim about when it happened.
    expect(ledger?.at).toBe(OBSERVED);
  });

  it('[QLU-8] re-reading the same snapshot adds nothing, and returns the very same log', () => {
    const actions = deriveRun(makeTwoIterationRun());
    const once = reconstruct(actions);
    const twice = observe(once, actions);
    expect(twice).toBe(once);
  });

  it('[QLU-8] a payload that changed under a key already seen is appended as a correction', () => {
    const actions = deriveRun(makeTwoIterationRun());
    const timeline = reconstruct(actions);
    const decision = actions.find((action) => action.type === 'decision/decided');
    if (decision?.type !== 'decision/decided') throw new Error('fixture has no decision');

    // An iteration once recorded is final, so this never happens in practice —
    // which is exactly why it is appended and visible when it does.
    const altered: InspectorAction = {
      ...decision,
      decision: { ...decision.decision, reason: 'something else entirely' },
    };
    const corrected = observe(timeline, [altered]);
    expect(corrected.entries).toHaveLength(timeline.entries.length + 1);
    const last = corrected.entries[corrected.entries.length - 1];
    expect(last.corrected).toBe(true);
    expect(last.action.key).not.toBe(decision.key);
    // History is added to, never rewritten: the original entry is untouched.
    expect(corrected.entries[entryByKey(corrected, decision.key)]).toEqual(
      timeline.entries[entryByKey(timeline, decision.key)],
    );
    expect(latestState(corrected).decision?.reason).toBe('something else entirely');
  });

  it('[QLU-8] an entry keeps its ordinal and its key as the log grows, so a selection never moves', () => {
    const open = makeRun({ status: 'running', finishedAt: null, trace: null });
    const first = reconstruct(deriveRun(open));
    const chosen = first.entries[1];
    const grown = observe(first, deriveRun(makeTwoIterationRun()));
    const index = entryByKey(grown, chosen.action.key);
    expect(grown.entries[index].ordinal).toBe(chosen.ordinal);
    expect(grown.entries[index]).toEqual(chosen);
  });

  it('[QLU-8] the log is bounded, and trimming can never corrupt a diff', () => {
    const actions = deriveRun(makeTwoIterationRun());
    const whole = reconstruct(actions);

    const bounded = recordActions(emptyTimeline(), actions, {
      provenance: 'reconstructed',
      max: 3,
    });
    expect(bounded.entries).toHaveLength(3);
    expect(bounded.dropped).toBe(actions.length - 3);
    // Ordinals are positions in the whole history, so a trimmed log still says
    // which actions these are.
    expect(bounded.entries[0].ordinal).toBe(actions.length - 3);

    // The baseline holds the trimmed prefix's result, so the first retained
    // entry is diffed against the state it actually followed — not against
    // nothing, which would report the whole run as one enormous addition.
    expect(beforeOf(bounded, 0)).toEqual(whole.entries[whole.entries.length - 4].after);
    // The same entry's change list is identical in the trimmed log and in the
    // untrimmed one, which is what "trimming can never corrupt a diff" means.
    const at = entryByKey(whole, bounded.entries[0].action.key);
    const changesIn = (timeline: Timeline, index: number) => {
      const before = beforeOf(timeline, index);
      const after = timeline.entries[index].after;
      return changesOf(diffOf(before, after), before, after);
    };
    expect(changesIn(bounded, 0)).toEqual(changesIn(whole, at));
    expect(changesIn(bounded, 0).length).toBeGreaterThan(0);
    expect(latestState(bounded)).toEqual(latestState(whole));

    // A trimmed action never comes back, however many times it is re-derived.
    const again = recordActions(bounded, actions, { provenance: 'recorded', max: 3 });
    expect(again).toBe(bounded);
  });

  it('[QLU-8] an empty log reads as the empty state, and names no entry', () => {
    const timeline = emptyTimeline();
    expect(latestState(timeline)).toEqual(beforeOf(timeline, 0));
    expect(entryByKey(timeline, null)).toBe(-1);
    expect(entryByKey(timeline, 'nothing')).toBe(-1);
  });
});
