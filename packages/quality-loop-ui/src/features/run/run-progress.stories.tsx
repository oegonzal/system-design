import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeEscalatedRun, makeRun } from '../../testing/fixtures';
import { RunProgress } from './run-progress';

const meta: Meta<typeof RunProgress> = {
  title: 'Quality Loop/RunProgress',
  component: RunProgress,
};
export default meta;

type Story = StoryObj<typeof RunProgress>;

const complete = makeRun();

/** Mid-loop: two exchanges attributed so far, the clock ticking. */
export const Running: Story = {
  args: {
    run: makeRun({
      status: 'running',
      finishedAt: null,
      trace: null,
      exchanges: complete.exchanges.slice(0, 2),
    }),
  },
};

export const Complete: Story = { args: { run: complete } };

/** The model was off; the record says so instead of pretending. */
export const ModelOff: Story = { args: { run: makeEscalatedRun() } };

export const Failed: Story = {
  args: {
    run: makeRun({
      status: 'failed',
      trace: null,
      exchanges: complete.exchanges.slice(0, 1),
      error: { name: 'Error', message: 'the producer returned malformed JSON', stack: null },
    }),
  },
};
