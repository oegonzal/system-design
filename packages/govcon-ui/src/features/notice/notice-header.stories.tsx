import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeOpportunity } from '../../testing/fixtures';
import { NoticeHeader } from './notice-header';

const meta: Meta<typeof NoticeHeader> = {
  title: 'Govcon/Notice/NoticeHeader',
  component: NoticeHeader,
  args: { opportunity: makeOpportunity() },
};
export default meta;

type Story = StoryObj<typeof NoticeHeader>;

/** A solicitation, open competition, with its sam.gov link. */
export const Default: Story = {};

/** A set-aside without a link or a solicitation number. */
export const SetAside: Story = {
  args: {
    opportunity: makeOpportunity({
      setAsideCode: 'SBA',
      uiLink: null,
      solicitationNumber: null,
      active: null,
      noticeType: null,
    }),
  },
};
