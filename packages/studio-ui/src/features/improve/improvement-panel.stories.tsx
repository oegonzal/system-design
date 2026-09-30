import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeImproveIteration, makeImproveRun } from '../../testing/fixtures';
import { ImprovementPanel } from './improvement-panel';

const meta: Meta<typeof ImprovementPanel> = {
  title: 'Studio/Coach/ImprovementPanel',
  component: ImprovementPanel,
  args: {
    run: null,
    error: null,
    isPolling: false,
    message: '',
    availability: { status: 'reachable', model: 'claude' },
    onStart: () => undefined,
    onLoadRevision: () => undefined,
  },
};
export default meta;

type Story = StoryObj<typeof ImprovementPanel>;

/** Idle, a model available: pick the iterations and hand over the draft. */
export const Idle: Story = {};

/** The quality loop cannot be reached — the button is off and says why. */
export const Unavailable: Story = {
  args: { availability: { status: 'unreachable' } },
};

/** Availability still being asked — the button waits without a reason. */
export const Checking: Story = {
  args: { availability: { status: 'checking' } },
};

/** Mid-run: model calls ticking up, one iteration already imported. */
export const Running: Story = {
  args: {
    run: makeImproveRun({
      exchangeCount: 9,
      iterations: [
        makeImproveIteration({
          iteration: 1,
          mode: 'provided',
          overall: 64,
          decision: 'revise',
          revisionId: 'rev-1',
        }),
        makeImproveIteration({
          iteration: 2,
          mode: 'revise',
          overall: 72,
          decision: 'revise',
          revisionId: 'rev-2',
        }),
      ],
    }),
    isPolling: true,
    message: 'Coaching — 9 model calls so far.',
  },
};

/** Stopped on a plateau with an accepted design to load. */
export const Stopped: Story = {
  args: {
    run: makeImproveRun({
      status: 'complete',
      stopReason: 'plateau',
      exchangeCount: 22,
      iterations: [
        makeImproveIteration({
          iteration: 1,
          mode: 'provided',
          overall: 64,
          decision: 'revise',
          revisionId: 'rev-1',
        }),
        makeImproveIteration({
          iteration: 2,
          mode: 'revise',
          overall: 72,
          decision: 'revise',
          revisionId: 'rev-2',
        }),
        makeImproveIteration({
          iteration: 3,
          mode: 'revise',
          overall: 70,
          decision: 'revise',
          revisionId: null,
        }),
      ],
    }),
    message: 'Coach finished — best score 72.',
  },
};

/** An iteration the studio would not store: accepted by the loop, refused here, and it says why. */
export const Refused: Story = {
  args: {
    run: makeImproveRun({
      status: 'complete',
      stopReason: 'accepted',
      exchangeCount: 14,
      iterations: [
        makeImproveIteration({ iteration: 1, overall: 64, decision: 'revise' }),
        makeImproveIteration({
          iteration: 2,
          overall: 83,
          decision: 'accept',
          reason: 'at or above the accept threshold of 75',
          outcome: 'refused',
          problems: [
            'binding c2 names node n-9, which the canvas does not draw',
            'narration c4 cites edge e-7, which the canvas does not draw',
          ],
          revisionId: null,
        }),
      ],
    }),
    message: 'Coach finished — best score 83.',
  },
};

/** Started from a graded revision: iteration 1 reuses that grade instead of grading again. */
export const FromGradedRevision: Story = {
  args: {
    run: makeImproveRun({
      exchangeCount: 3,
      iterations: [
        makeImproveIteration({ iteration: 1, mode: 'adopted', overall: 72, decision: 'revise' }),
      ],
    }),
    isPolling: true,
    message: 'Coaching — 3 model calls so far.',
  },
};

/** The run failed outright. */
export const Failed: Story = {
  args: {
    run: makeImproveRun({ status: 'failed', error: 'the producer refused', iterations: [] }),
    error: 'the producer refused',
    message: 'Coach problem: the producer refused',
  },
};
