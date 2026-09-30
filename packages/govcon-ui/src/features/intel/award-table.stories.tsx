import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { AWARDS } from '../../testing/fixtures';
import { AwardTable } from './award-table';

const meta: Meta<typeof AwardTable> = {
  title: 'Govcon/Intel/AwardTable',
  component: AwardTable,
  args: { awards: AWARDS, total: AWARDS.length, limit: 50, offset: 0, onPage: fn() },
};
export default meta;

type Story = StoryObj<typeof AwardTable>;

/** Three awards, two from SAM.gov and one from USAspending. */
export const Default: Story = {};

/** The second page of a larger store. */
export const Paged: Story = { args: { total: 120, limit: 3, offset: 3 } };

/** Nothing over these filters. */
export const Empty: Story = { args: { awards: [], total: 0 } };
