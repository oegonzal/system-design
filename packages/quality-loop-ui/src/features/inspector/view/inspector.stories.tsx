import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  makeEscalatedRun,
  makeOrchestration,
  makeTwoIterationRun,
} from '../../../testing/fixtures';
import { ACTION_GROUPS, type ActionGroup } from '../model/action';
import { deriveOrchestration } from '../model/derive-orchestration';
import { deriveRun } from '../model/derive-run';
import { timelineRows } from '../model/select';
import { beforeOf, emptyTimeline, recordActions, type Timeline } from '../model/timeline';
import { Inspector } from './inspector';

/**
 * The inspector over fixture runs. Every argument is data, so the catalog shows
 * the same component the app renders — which is also how axe reaches it.
 */
const meta: Meta<typeof Inspector> = {
  title: 'Quality Loop/Inspector',
  component: Inspector,
};
export default meta;

type Story = StoryObj<typeof Inspector>;

const ALL = new Set(Object.keys(ACTION_GROUPS) as ActionGroup[]);

const log = (): Timeline => {
  const run = makeTwoIterationRun();
  return recordActions(emptyTimeline(), deriveRun(run), { provenance: 'reconstructed' });
};

const argsFor = (timeline: Timeline, at: number): StoryObj<typeof Inspector>['args'] => {
  const rows = timelineRows(timeline);
  const index = at < 0 ? timeline.entries.length + at : at;
  const row = rows.find((candidate) => candidate.entry.ordinal === timeline.entries[index].ordinal);
  return {
    rows,
    total: timeline.entries.length,
    dropped: timeline.dropped,
    selectedKey: row?.entry.action.key ?? null,
    onSelect: () => undefined,
    selected: row === undefined ? null : { row, before: beforeOf(timeline, index) },
    available: [...ALL],
    shown: ALL,
    onToggleGroup: () => undefined,
    ignoreTimings: false,
    onIgnoreTimings: () => undefined,
    following: null,
    behind: 0,
    onFollow: () => undefined,
    provenanceNote:
      'All actions were read back out of one recorded snapshot. Their order and payloads are what the engine declared.',
  };
};

/** The second iteration's normalisation: one criterion moved, two findings gone. */
export const LedgerChanged: Story = {
  args: (() => {
    const timeline = log();
    const at = timeline.entries.findIndex(
      (entry) => entry.action.type === 'ledger/normalised' && entry.action.scope.iteration === 2,
    );
    return argsFor(timeline, at);
  })(),
};

/** The producer's second attempt: the rendered text gained a component. */
export const ArtifactRevised: Story = {
  args: (() => {
    const timeline = log();
    const at = timeline.entries.findIndex(
      (entry) => entry.action.type === 'artifact/produced' && entry.action.scope.iteration === 2,
    );
    return argsFor(timeline, at);
  })(),
};

/** A run where every model call failed: the diagnostics are the evidence. */
export const NothingProduced: Story = {
  args: (() => {
    const timeline = recordActions(emptyTimeline(), deriveRun(makeEscalatedRun()), {
      provenance: 'reconstructed',
    });
    return argsFor(timeline, -1);
  })(),
};

/** An orchestration with its steps and one child run's actions nested under them. */
export const Orchestration: Story = {
  args: (() => {
    const run = makeTwoIterationRun();
    const timeline = recordActions(
      emptyTimeline(),
      deriveOrchestration(makeOrchestration(), { children: { [run.runId]: run } }),
      { provenance: 'reconstructed' },
    );
    const at = timeline.entries.findIndex((entry) => entry.action.type === 'step/completed');
    return argsFor(timeline, at);
  })(),
};

/** Following a live run, with the reader pinned to an earlier action. */
export const FollowingDetached: Story = {
  args: (() => {
    const timeline = log();
    return { ...argsFor(timeline, 3), following: false, behind: timeline.entries.length - 4 };
  })(),
};

/** Nothing selected yet. */
export const NothingSelected: Story = {
  args: (() => {
    const timeline = log();
    return { ...argsFor(timeline, 0), selectedKey: null, selected: null };
  })(),
};
