import type { Meta, StoryObj } from '@storybook/react-vite';

import { PULSE } from '../../testing/spending-fixtures';
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

export const Pending: Story = { args: { pending: true } };
