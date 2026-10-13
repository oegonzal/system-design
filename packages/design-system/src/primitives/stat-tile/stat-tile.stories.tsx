import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatGrid, StatTile } from './stat-tile';

const meta: Meta<typeof StatTile> = {
  title: 'Design System/Primitives/StatTile',
  component: StatTile,
  args: { label: 'Total obligated', value: '$8,000,000' },
};
export default meta;

type Story = StoryObj<typeof StatTile>;

export const Default: Story = {};

/** A comparison line under the figure. */
export const WithDetail: Story = {
  args: { label: 'Year to date', value: '$5.2M', detail: '+12% vs the prior year to date' },
};

/** Four tiles in the responsive grid. */
export const Grid: Story = {
  render: () => (
    <StatGrid aria-label="Fiscal year to date">
      <StatTile label="Year to date" value="$5.2M" detail="FY2026 through period 8" />
      <StatTile label="Prior year to date" value="$4.6M" detail="FY2025 through period 8" />
      <StatTile label="Projected remainder" value="$2.1M" detail="$1.8M–$2.4M" />
      <StatTile label="Projected total" value="$7.3M" />
    </StatGrid>
  ),
};
