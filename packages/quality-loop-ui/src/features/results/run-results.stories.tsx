import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeEscalatedRun, makeRun, makeTwoIterationRun } from '../../testing/fixtures';
import { RunResults } from './run-results';

const meta: Meta<typeof RunResults> = {
  title: 'Quality Loop/RunResults',
  component: RunResults,
};
export default meta;

type Story = StoryObj<typeof RunResults>;

const traceOf = (run: ReturnType<typeof makeRun>) => {
  if (!run.trace) throw new Error('fixture has no trace');
  return run.trace;
};

/** One iteration the controller sent back for revision. */
export const Revised: Story = { args: { trace: traceOf(makeRun()) } };

/** Every model call failed: no criteria, no artifact, an honest escalation. */
export const Escalated: Story = { args: { trace: traceOf(makeEscalatedRun()) } };

/** Revise, then accept — with the lessons the loop drew across the two. */
export const TwoIterations: Story = { args: { trace: traceOf(makeTwoIterationRun()) } };
