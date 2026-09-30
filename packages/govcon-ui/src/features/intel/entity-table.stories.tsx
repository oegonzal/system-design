import { entityOf, type EntityLookup } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ENTITY } from '../../testing/fixtures';
import { EntityTable } from './entity-table';

export const LOOKUP: EntityLookup = {
  entities: [
    ENTITY,
    entityOf({
      uei: 'BAD123456789',
      cage: null,
      legalName: 'BARRED CO',
      registrationStatus: 'Expired',
      registrationExpiresAt: '2025-01-01',
      naics: [{ code: '541511', small: false }],
      excluded: true,
    }),
  ],
  unknown: ['ZZZ000000001'],
  spent: 2,
  budget: 1000,
};

const meta: Meta<typeof EntityTable> = {
  title: 'Govcon/Intel/EntityTable',
  component: EntityTable,
  args: { lookup: LOOKUP },
};
export default meta;

type Story = StoryObj<typeof EntityTable>;

/** Two registrants — one excluded — and a UEI the registry did not know. */
export const Default: Story = {};

/** Before any lookup. */
export const None: Story = { args: { lookup: null } };

/** A batch the registry knew nothing of. */
export const Unknown: Story = {
  args: { lookup: { entities: [], unknown: ['ZZZ000000001'], spent: 3, budget: 1000 } },
};
