import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeOpportunity } from '../../testing/fixtures';
import { NoticeFacts } from './notice-facts';

const meta: Meta<typeof NoticeFacts> = {
  title: 'Govcon/Notice/NoticeFacts',
  component: NoticeFacts,
  args: { opportunity: makeOpportunity() },
};
export default meta;

type Story = StoryObj<typeof NoticeFacts>;

/** Place, office and the primary contact. */
export const Default: Story = {};

/** Nothing stated: a notice with no place, no office and no contact. */
export const Sparse: Story = {
  args: {
    opportunity: makeOpportunity({
      placeOfPerformance: null,
      officeAddress: null,
      pointsOfContact: [],
    }),
  },
};
