import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { ENTITY } from '../../testing/fixtures';
import { RegistrationPanel } from './registration-panel';

const meta: Meta<typeof RegistrationPanel> = {
  title: 'Govcon/Firm/Registration',
  component: RegistrationPanel,
  args: { uei: ENTITY.uei, entity: ENTITY, onLookup: fn() },
};
export default meta;

type Story = StoryObj<typeof RegistrationPanel>;

/** A registration the store holds. */
export const Stored: Story = {};

/** Nothing stored yet: the lookup is one request, and says so. */
export const NotLookedUp: Story = { args: { entity: null } };

export const Pending: Story = { args: { entity: null, pending: true } };

/** SAM.gov knows no such registrant. */
export const Unknown: Story = {
  args: { entity: null, problem: `SAM.gov knows no registrant ${ENTITY.uei}.` },
};
