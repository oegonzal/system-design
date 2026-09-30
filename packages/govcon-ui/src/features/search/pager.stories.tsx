import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { Pager } from './pager';

const meta: Meta<typeof Pager> = {
  title: 'Govcon/Pager',
  component: Pager,
  args: { offset: 25, limit: 25, total: 62, onChange: fn() },
};
export default meta;

type Story = StoryObj<typeof Pager>;

/** The middle page of three. */
export const Middle: Story = {};

/** The first page: nothing before it. */
export const First: Story = { args: { offset: 0 } };

/** The last page: nothing after it. */
export const Last: Story = { args: { offset: 50 } };

/** No rows at all. */
export const Empty: Story = { args: { offset: 0, total: 0 } };
