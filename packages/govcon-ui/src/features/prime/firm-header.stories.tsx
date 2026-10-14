import type { Meta, StoryObj } from '@storybook/react-vite';

import { FirmHeader } from './firm-header';

const HOLDINGS = { amount: 2_512_000_000, from: '2025-06-15', to: '2026-06-15' };

const meta: Meta<typeof FirmHeader> = {
  title: 'Govcon/Firm/Header',
  component: FirmHeader,
  args: { uei: 'JCBMLGPE6Z71', name: 'BOOZ ALLEN HAMILTON INC', holdings: HOLDINGS },
};
export default meta;

type Story = StoryObj<typeof FirmHeader>;

/** A firm an award names, with what it holds in the codes read. */
export const Named: Story = {};

/** Nothing names it yet: the UEI heads the page. */
export const Unnamed: Story = { args: { name: null, holdings: null } };

/** A registered firm that holds nothing in these codes. */
export const HoldsNothing: Story = { args: { holdings: { ...HOLDINGS, amount: 0 } } };
