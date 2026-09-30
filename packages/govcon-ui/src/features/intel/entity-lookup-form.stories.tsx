import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { EntityLookupForm } from './entity-lookup-form';

const meta: Meta<typeof EntityLookupForm> = {
  title: 'Govcon/Intel/EntityLookupForm',
  component: EntityLookupForm,
  args: { onLookup: fn() },
};
export default meta;

type Story = StoryObj<typeof EntityLookupForm>;

/** Empty: the button waits for a UEI. */
export const Default: Story = {};

/** A batch in flight. */
export const Pending: Story = { args: { pending: true } };
