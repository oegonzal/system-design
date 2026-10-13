import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { HORIZON } from '../../testing/spending-fixtures';
import { HorizonChart, HorizonMonths, HorizonTable, HorizonTiles } from './horizon-panels';

const meta: Meta<typeof HorizonChart> = {
  title: 'Govcon/Spending/Horizon',
  component: HorizonChart,
  args: { horizon: HORIZON },
};
export default meta;

type Story = StoryObj<typeof HorizonChart>;

/** Twelve months of expiring awards, contracts and IDVs stacked. */
export const Chart: Story = {};

export const Tiles: Story = { render: () => <HorizonTiles horizon={HORIZON} /> };

/** The walk hit its page cap: the list is partial and says how far it reached. */
export const Capped: Story = {
  render: () => (
    <HorizonTiles
      horizon={{ ...HORIZON, capped: true, stoppedBy: 'pages', reachedEndsAt: '2026-11-30' }}
    />
  ),
};

/** A wide scope: thirty pages of awards all ending after the window, so nothing is known inside it. */
export const Unreached: Story = {
  render: () => (
    <HorizonTiles
      horizon={{
        ...HORIZON,
        rows: [],
        openNotices: [],
        buckets: HORIZON.buckets.map((bucket) => ({
          ...bucket,
          contracts: { count: 0, amount: 0 },
          idvs: { count: 0, amount: 0 },
        })),
        capped: true,
        stoppedBy: 'pages',
        reachedEndsAt: '2027-05-31',
      }}
    />
  ),
};

/** The soonest-ending rows; the first already has an open notice for its work and buyer. */
export const Rows: Story = {
  render: () => (
    <HorizonTable
      rows={HORIZON.rows}
      openNotices={HORIZON.openNotices}
      offset={0}
      limit={25}
      onPage={fn()}
    />
  ),
};

export const NoRows: Story = {
  render: () => <HorizonTable rows={[]} openNotices={[]} offset={0} limit={25} onPage={fn()} />,
};

export const Months: Story = { render: () => <HorizonMonths value={12} onChange={fn()} /> };
