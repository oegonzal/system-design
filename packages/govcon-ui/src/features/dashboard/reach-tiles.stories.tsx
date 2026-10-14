import type { Meta, StoryObj } from '@storybook/react-vite';

import { REACH } from '../../testing/spending-fixtures';
import { ReachTiles } from './reach-tiles';

const meta: Meta<typeof ReachTiles> = {
  title: 'Govcon/Dashboard/ReachTiles',
  component: ReachTiles,
  args: { reach: REACH, href: '/spending?tab=reach' },
};
export default meta;

type Story = StoryObj<typeof ReachTiles>;

/** The year's new contracts in the profile's codes, cut by cut. */
export const Default: Story = {};

/** A scope with no new contracts: every share is a dash, not a division by nothing. */
export const Nothing: Story = {
  args: {
    reach: {
      ...REACH,
      cuts: REACH.cuts.map((cut) => ({ ...cut, awards: 0, amount: 0 })),
      bands: REACH.bands.map((band) => ({ ...band, awards: 0 })),
    },
  },
};
