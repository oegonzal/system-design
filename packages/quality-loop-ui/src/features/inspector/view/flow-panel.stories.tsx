import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  makeMemoryOrchestration,
  makeOrchestration,
  makeRunningOrchestration,
  makeTwoIterationRun,
  MEMORY_SOURCE_RUN_ID,
  ORCHESTRATION_CHILD_IDS,
} from '../../../testing/fixtures';
import { dataFlow, flowTotals } from '../model/data-flow';
import { deriveOrchestration } from '../model/derive-orchestration';
import { reduceAll } from '../model/reduce';
import { emptyState } from '../model/state';
import { FlowPanel } from './flow-panel';

const meta: Meta<typeof FlowPanel> = {
  title: 'Quality Loop/Inspector/FlowPanel',
  component: FlowPanel,
};
export default meta;

type Story = StoryObj<typeof FlowPanel>;

const argsFor = (
  record = makeOrchestration(),
  children: Record<string, ReturnType<typeof makeTwoIterationRun>> = {},
  unread = 0,
) => {
  const flow = dataFlow(reduceAll(emptyState(), deriveOrchestration(record)), children);
  return { flow, totals: flowTotals(flow), unread };
};

const read = Object.fromEntries(
  ORCHESTRATION_CHILD_IDS.map((runId) => [runId, { ...makeTwoIterationRun(), runId }]),
);

/** A finished calibration: three children read, and the reconcile's own report. */
export const Finished: Story = { args: argsFor(makeOrchestration(), read) };

/** Mid-flight: two of three children opened, the reconcile not started. */
export const Running: Story = {
  args: argsFor(
    makeRunningOrchestration(),
    { [ORCHESTRATION_CHILD_IDS[0]]: read[ORCHESTRATION_CHILD_IDS[0]] },
    0,
  ),
};

/** A failed panel step, and the reconcile the record says it blocked. */
export const Blocked: Story = {
  args: (() => {
    const base = makeOrchestration();
    return argsFor(
      makeOrchestration({
        status: 'failed',
        steps: {
          panel: {
            ...base.steps['panel'],
            status: 'failed',
            reason: 'run-failed',
            note: 'a sample threw',
          },
          reconcile: {
            ...base.steps['reconcile'],
            status: 'skipped',
            reason: 'upstream-failed',
            note: 'panel',
            report: null,
          },
        },
      }),
      read,
    );
  })(),
};

/** Children beyond the read bound: listed by id and said to be unread. */
export const ChildrenNotRead: Story = { args: argsFor(makeOrchestration(), {}, 4) };

/**
 * A memory orchestration over a settled run. Two steps were settled at open
 * because a provided run stands in for them, so `target` names a run it never
 * opened — the one shape a step ledger can read falsely if it calls that a child.
 */
export const RunStoodIn: Story = {
  args: argsFor(makeMemoryOrchestration(), {
    [MEMORY_SOURCE_RUN_ID]: { ...makeTwoIterationRun(), runId: MEMORY_SOURCE_RUN_ID },
  }),
};
