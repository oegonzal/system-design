import type { Meta, StoryObj } from '@storybook/react-vite';

import { AttachmentList } from './attachment-list';

const meta: Meta<typeof AttachmentList> = {
  title: 'Govcon/Notice/AttachmentList',
  component: AttachmentList,
  args: {
    attachments: [
      {
        ordinal: 0,
        url: 'https://sam.gov/api/prod/opps/v3/opportunities/resources/files/c30288c45b7b4fb39e647a2eab150983/download',
      },
      {
        ordinal: 1,
        url: 'https://sam.gov/api/prod/opps/v3/opportunities/resources/files/0f1e2d3c4b5a69788796a5b4c3d2e1f0/download',
      },
    ],
  },
};
export default meta;

type Story = StoryObj<typeof AttachmentList>;

/** Two files, each a public link. */
export const Default: Story = {};

/** A notice without files. */
export const None: Story = { args: { attachments: [] } };
