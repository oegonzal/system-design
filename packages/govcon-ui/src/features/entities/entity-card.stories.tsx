import type { Meta, StoryObj } from '@storybook/react-vite';

import { ENTITY, OWN_ENTITY } from '../../testing/fixtures';
import { EntityCard } from './entity-card';

const meta: Meta<typeof EntityCard> = {
  title: 'Govcon/EntityCard',
  component: EntityCard,
  args: { entity: ENTITY },
};
export default meta;

type Story = StoryObj<typeof EntityCard>;

/** An awardee: active, small in its NAICS. */
export const Default: Story = {};

/** The company itself, on the dashboard. */
export const Own: Story = { args: { entity: OWN_ENTITY, headingLevel: 2 } };

/** On the exclusions list: the card says so first. */
export const Excluded: Story = {
  args: {
    entity: { ...ENTITY, registrationStatus: 'Expired', excluded: true, sbaCertifications: ['A6'] },
  },
};
