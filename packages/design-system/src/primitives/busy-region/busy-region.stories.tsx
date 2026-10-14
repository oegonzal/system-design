import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatTile } from '../stat-tile/stat-tile';
import { BusyRegion } from './busy-region';

const meta: Meta<typeof BusyRegion> = {
  title: 'Design System/Primitives/BusyRegion',
  component: BusyRegion,
  args: {
    busy: false,
    children: <StatTile label="Obligated in the window" value="$67.5B" detail="FY2025" />,
  },
};
export default meta;

type Story = StoryObj<typeof BusyRegion>;

/** The answer to what was asked. */
export const Settled: Story = {};

/** The last answer, while the next one loads: as readable as before, under a bar, and marked busy. */
export const Busy: Story = { args: { busy: true } };
