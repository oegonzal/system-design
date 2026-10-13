import type { Meta, StoryObj } from '@storybook/react-vite';

import { PULSE, PULSE_DELAYED } from '../../testing/spending-fixtures';
import { pulseFigures } from './pulse-figures';
import { PulseChart, PulseTiles } from './pulse-panels';

const meta: Meta<typeof PulseChart> = {
  title: 'Govcon/Spending/Pulse',
  component: PulseChart,
  args: { pulse: PULSE },
};
export default meta;

type Story = StoryObj<typeof PulseChart>;

/** Three complete years, this year through period 9, the rest projected. */
export const Chart: Story = {};

/** The headline figures the same pulse gives. */
export const Tiles: Story = { render: () => <PulseTiles figures={pulseFigures(PULSE)} /> };

/** Nothing to project from: a scope the source only has this year for. */
export const Unprojected: Story = {
  args: {
    pulse: {
      ...PULSE,
      series: PULSE.series.filter((point) => point.fiscalYear === 2026),
      projection: null,
    },
  },
};

/** One agency publishes 90 days late: the periods after the last whole day are provisional, and the note says why. */
export const Delayed: Story = { args: { pulse: PULSE_DELAYED } };

/** The same delay in the tiles: the change is taken over the settled periods only. */
export const DelayedTiles: Story = {
  render: () => <PulseTiles figures={pulseFigures(PULSE_DELAYED)} />,
};

export const Pending: Story = { args: { pending: true } };
