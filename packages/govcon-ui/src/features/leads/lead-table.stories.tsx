import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { LEADS, makeLeadsReport } from '../../testing/fixtures';
import { LeadTable } from './lead-table';

const meta: Meta<typeof LeadTable> = {
  title: 'Govcon/LeadTable',
  component: LeadTable,
  args: {
    report: makeLeadsReport(),
    activeNoticeId: LEADS[1]?.opportunity.noticeId ?? null,
    onSelect: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof LeadTable>;

/** Three leads, high to low; the second is open. */
export const Default: Story = {};

/** Nothing stored, or nothing over the filters. */
export const Empty: Story = {
  args: {
    report: makeLeadsReport({ candidates: 0, excluded: 0, matching: 0, leads: [] }),
    activeNoticeId: null,
  },
};
