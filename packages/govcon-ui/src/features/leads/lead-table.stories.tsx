import type { Meta, StoryObj } from '@storybook/react-vite';

import { LEADS, makeLeadsReport } from '../../testing/fixtures';
import { LeadTable } from './lead-table';

const meta: Meta<typeof LeadTable> = {
  title: 'Govcon/LeadTable',
  component: LeadTable,
  args: { report: makeLeadsReport(), activeNoticeId: LEADS[0]?.opportunity.noticeId ?? null },
};
export default meta;

type Story = StoryObj<typeof LeadTable>;

/** Three leads, high to low, the first one open. */
export const Default: Story = {};

/** Nothing stored yet, or every candidate under the floor. */
export const Empty: Story = {
  args: {
    report: makeLeadsReport({ candidates: 0, excluded: 0, matching: 0, leads: [] }),
    activeNoticeId: null,
  },
};

/** The candidate bound cut the set: the caption says so. */
export const Capped: Story = { args: { report: makeLeadsReport({ capped: true }) } };
